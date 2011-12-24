/*-*- coding: utf-8 -*-
 * ---------------------------------------------------------------------------
 * Gettings Things Gnome! - a personal organizer for the GNOME desktop
 * Copyright (c) 2011 - Luca Invernizzi
 *
 * This program is free software: you can redistribute it and/or modify it under
 * the terms of the GNU General Public License as published by the Free Software
 * Foundation, either version 3 of the License, or (at your option) any later
 * version.
 *
 * This program is distributed in the hope that it will be useful, but WITHOUT
 * ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
 * FOR A PARTICULAR PURPOSE. See the GNU General Public License for more
 * details.
 *
 * You should have received a copy of the GNU General Public License along with
 * this program.  If not, see <http://www.gnu.org/licenses/>.
 * --------------------------------------------------------------------------- */

/* Gnome Shell extension that integrates GTG into the calendar panel */

const St = imports.gi.St;
const Main = imports.ui.main;
const Lang = imports.lang;
const Clutter = imports.gi.Clutter;
const DBus = imports.dbus;
const PopupMenu = imports.ui.popupMenu;

/****************************************************************************
 * Helpers
 ***************************************************************************/

/* The equivalent of functools.partial in Python :) */
function partial(func /*, 0..n args */) {
    var args = Array.prototype.slice.call(arguments, 1);
    return function() {
        var allArguments = args.concat(Array.prototype.slice.call(arguments));
        return func.apply(this, allArguments);
    }
}

/* Handles the vertical separator look
* Function borrowed from dateTime.js */
function _onVertSepRepaint(area) {
    let cr = area.get_context();
    let themeNode = area.get_theme_node();
    let [width, height] = area.get_surface_size();
    let stippleColor = themeNode.get_color('-stipple-color');
    let stippleWidth = themeNode.get_length('-stipple-width');
    let x = Math.floor(width/2) + 0.5;
    cr.moveTo(x, 0);
    cr.lineTo(x, height);
    Clutter.cairo_set_source_color(cr, stippleColor);
    cr.setDash([1, 3], 1); // Hard-code for now
    cr.setLineWidth(stippleWidth);
    cr.stroke();
}

/****************************************************************************
 * DBus
 ***************************************************************************/

const GtgIFace = {
    name: 'org.gnome.GTG',
    methods: [{name: 'GetActiveTasks',
               inSignature: 'as',
               outSignature: 'aa{sv}' },
              {name: 'ShowTaskBrowser',
               inSignature: '',
               outSignature: '' },
              {name: 'GetTask',
               inSignature: 's',
               outSignature: 'aa{sv}' },
              {name: 'OpenTaskEditor',
               inSignature: 's',
               outSignature: '' }],
    signals: [{name: 'TaskAdded',
               inSignature: 's'},
              {name: 'TaskModified',
               inSignature: 's'},
              {name: 'TaskDeleted',
               inSignature: 's'}]
};

const Gtg = DBus.makeProxyClass(GtgIFace);
const gtg = new Gtg(DBus.session, 'org.gnome.GTG', '/org/gnome/GTG');

function getActiveTasks(tags, callback) {
    function handler(results, error) {
        if (error != null)
            global.log("Error retrieving GTG tasks: "+error);
        else
            callback(results);
    }
    gtg.GetActiveTasksRemote(tags, handler);
}

function getTask(tid, callback) {
    function handler(task, error) {
        if (error != null)
            global.log("Error retrieving GTG tasks: "+error);
        else
            callback(task);
    }
    gtg.GetTaskRemote(tid, handler);
}

function openTaskEditor(task_id) {
    gtg.OpenTaskEditorRemote(task_id);
}

function showTaskBrowser() {
    gtg.ShowTaskBrowserRemote();
}

function onTaskClicked(task_id) {
    Main.panel._dateMenu.menu.close();
    openTaskEditor(task_id);
}

/****************************************************************************
 * Extension core
 ***************************************************************************/
let K = 10;
let gtgBox, tasksBox, topKTasks, more_tasks_button;

/* Returns a score on the importance of the task. The lower the score,
 * the higher the importance.
 * The top K tasks, in descending order of importance, will be displayed
 */
function _getTaskScore(task) {
    let time = Date.parse(task.duedate);
    let score = new Date();
    if (isNaN(time)) {
        let fuzzy_date_discount = {'now': -3, 'soon': -2, 'later': +1}[task.duedate];
        let year = 2037; /* oh, 32-bit epoch! */
        if (! isNaN(fuzzy_date_discount)) {
            year += fuzzy_date_discount;
        }
        score.setYear(year);
    } else {
        score.setTime(time);
        task.due_today = true;
    }
    return score;
}

/* Inserts a task button in the UI (if it's one of the top K)
 */
function _insertTaskAtIndex(index, task) {
    topKTasks.splice(index, 0, task);
    if (index <= K) {
        /* if the task is due soon, add it to the UI */
        task.button = _prepareTaskButton(task);
        tasksBox.insert_actor(task.button, index, {expand: true});
    }
}

/* Creates a task button
 */
function _prepareTaskButton(task) {
    let title = task.title.substr(0, 70);
    if (title.length != task.title.length) title += '...';
    let style_class = 'events-day-task';
    if (task.due_today) {style_class += ' due-today';}
    let task_button = new PopupMenu.PopupMenuItem(title,
                        {style_class: style_class});
    task_button.connect('activate', partial(onTaskClicked, task.id));
    return task_button.actor;
}

/* Handles the TaskAdded, TaskModified signals
 */
function onTaskAddedOrModified(task) {
    /* Delete all tasks with the same id in the UI */
    while (onTaskDeleted(task.id)){}
    if (task.status != 'Active') {
        return;
    }
    /* compute task score */
    task.score = _getTaskScore(task);
    /* sorted insert */
    let index = 0;
    let inserted = false;
    while (index < topKTasks.length) {
        if (task.score <= topKTasks[index].score) {
            _insertTaskAtIndex(index, task);
            inserted = true;
            break;
        }
        index += 1;
    }
    /* if the K have not been found yet, append */
    if (index < K && ! inserted) {
        _insertTaskAtIndex(index, task);
    }
    /* delete any element after K */
    for (index in topKTasks.slice(K + 1)) {
        if (task.button) {
            task.button.destroy();
            task.button = null;
        }
    }
    /* if more than K tasks, add the [..] symbol */
    if(topKTasks.length > K && ! more_tasks_button) {
        more_tasks_button = new PopupMenu.PopupMenuItem('[...]',
                                   {style_class: 'events-day-task'})
        tasksBox.add(more_tasks_button.actor, -1, {expand: true});
    }
}

/* Handles the TaskDeleted signal
 */
function onTaskDeleted(tid) {
    let index = 0;
    let deleted = false;
    while (index < topKTasks.length) {
        let task = topKTasks[index];
        if (task.id == tid) {
            if (task.button) {
                task.button.destroy();
                task.button = null;
            }
            deleted = true;
            break;
        }
        index += 1;
    }
    if (deleted) {
        topKTasks.splice(index, 1);
    }
    if (topKTasks.length <= K && more_tasks_button) {
        more_tasks_button.destroy();
        more_tasks_button = null;
    }
    return deleted;
}

/* Performs a full refresh of all tasks (useful when Gnome-Shell
 * is started)
 */
function refreshAllTasks() {
    topKTasks = new Array();
    getActiveTasks(['@all'], function (tasks) {
        for (var i in tasks) {
            onTaskAddedOrModified(tasks[i]);
        }
    });
}

/****************************************************************************
 * Extension interface
 ***************************************************************************/

let signal_added_handle, signal_modified_handle, signal_deleted_handle;

/* Initialization */
function init() {
}

/* Extension disabling */
function disable() {
    gtgBox.destroy();
    signal_added_handle.disconnect();
    signal_modified_handle.disconnect();
    signal_deleted_handle.disconnect();
}

/*Extension enabling */
function enable() {
    /* Add GTG widget */
    function getChildByName (a_parent, name) {
        return a_parent.get_children().filter(
                function(elem){
                    return elem.name == name
                })[0];
    }
    calendarArea = getChildByName(Main.panel._dateMenu.menu.box, 'calendarArea');
    separator = new St.DrawingArea({style_class: 'calendar-vertical-separator',
                                        pseudo_class: 'highlighted' });
    separator.connect('repaint', Lang.bind(this, _onVertSepRepaint));
    calendarArea.add_actor(separator);
    gtgBox = new St.BoxLayout();
    gtgBox.set_vertical(true);
    calendarArea.add_actor(gtgBox, {expand: true});
    tasksBox = new St.BoxLayout();
    tasksBox.set_vertical(true);
    gtgBox.add(tasksBox, {style_class: 'calendar'});
    /* Add "Open GTG" button */
    open_gtg_button = new PopupMenu.PopupMenuItem("Open GTG");
    open_gtg_button.connect('activate', function () {
        Main.panel._dateMenu.menu.close();
        showTaskBrowser();
    });
    open_gtg_button.actor.can_focus = false;
    gtgBox.add(open_gtg_button.actor,
               {y_align: St.Align.END,
                expand: true,
                y_fill: false});
    /* start listening for tasks */
    refreshAllTasks();
    signal_added_handle = gtg.connect(
        'TaskAdded', function(sender, tid) {
            getTask(tid, onTaskAddedOrModified);
        });
    signal_modified_handle = gtg.connect(
        'TaskModified', function(sender, tid) {
            getTask(tid, onTaskAddedOrModified);
        });
    signal_deleted_handle = gtg.connect(
        'TaskDeleted', function(sender, tid) {
            onTaskDeleted(tid);
        });
}
