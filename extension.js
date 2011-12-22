const St = imports.gi.St;
const Main = imports.ui.main;
const Lang = imports.lang;
const Clutter = imports.gi.Clutter;
const DBus = imports.dbus;
const PopupMenu = imports.ui.popupMenu;

function init () {
}

function partial(func /*, 0..n args */) {
    var args = Array.prototype.slice.call(arguments, 1);
    return function() {
        var allArguments = args.concat(Array.prototype.slice.call(arguments));
        return func.apply(this, allArguments);
    };
}

function _onVertSepRepaint (area) {
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
};

const GtgIFace = {
    name: 'org.gnome.GTG',
    methods: [{ name: 'GetActiveTasks',
                inSignature: 'as',
                outSignature: 'aa{sv}' },
              { name: 'ShowTaskBrowser',
                inSignature: '',
                outSignature: '' },
              { name: 'OpenTaskEditor',
                inSignature: 's',
                outSignature: '' }],
};

const Gtg = DBus.makeProxyClass(GtgIFace);
const _gtg = new Gtg(DBus.session, 'org.gnome.GTG', '/org/gnome/GTG');

function getActiveTasks (tags, callback) {
    function handler(results, error) {
        if (error != null)
            global.log("Error retrieving GTG tasks: "+error);
        else
            callback(results);
    }
    _gtg.GetActiveTasksRemote(tags, handler);
}

function openTaskEditor (task_id) {
    _gtg.OpenTaskEditorRemote(task_id);
}

function showTaskBrowser () {
    _gtg.ShowTaskBrowserRemote();
}

function _onTaskClicked (task_id) {
    Main.panel._dateMenu.menu.close();
    openTaskEditor(task_id);
}


function enable () {
    function getChildByName (a_parent, name) {
        return a_parent.get_children().filter(
                function(elem){
                    return elem.name == name
                })[0];
    };
    let calendarArea = getChildByName(Main.panel._dateMenu.menu.box, 'calendarArea');
    let separator = new St.DrawingArea({style_class: 'calendar-vertical-separator',
                                        pseudo_class: 'highlighted' });
    separator.connect('repaint', Lang.bind(this, _onVertSepRepaint));
    calendarArea.add_actor(separator);

    gtgBox = new St.BoxLayout();
    gtgBox.set_vertical(true);
    calendarArea.add_actor(gtgBox, {expand: true});
    tasksBox = new St.BoxLayout();
    tasksBox.set_vertical(true);
    gtgBox.add(tasksBox, {style_class: 'calendar'});

    getActiveTasks(['@all'], function (tasks) {
        Main.gtg = tasks;
        for (var i in tasks) {
            let task = tasks[i];
            time = Date.parse(task.duedate);
            task.sort_index = new Date();
            if (isNaN(time)) {
                fuzzy_date_discount = {'now': -3, 'soon': -2, 'later': +1}[task.duedate];
                year = 3000;
                if (fuzzy_date_discount) {
                    year += fuzzy_date_discount;
                };
                task.sort_index.setYear(year);
            } else {
                task.sort_index.setTime(time);
                task.due_today = true;
            };
        };
        tasks.sort(function(a, b) { return a.sort_index > b.sort_index });
        for (var i in tasks) {
            if (i > 15) {
                tasksBox.add(new PopupMenu.PopupMenuItem('[...]',
                             {style_class: 'events-day-task'}
                        ).actor, -1, {expand: true});
                break;
            }
            let task = tasks[i];
            let title = task.title.substr(0, 70);
            if (title.length != task.title.length) title += '...';
            style_class = 'events-day-task';
            if (task.due_today) style_class += ' due-today';
            let task_button = new PopupMenu.PopupMenuItem(title,
                                {style_class: style_class});
            task_button.connect('activate', partial(_onTaskClicked, task.id));
            tasksBox.add(task_button.actor, -1, {expand: true});
        };
    });


    item = new PopupMenu.PopupMenuItem(_("Open GTG"));
    item.connect('activate', function () {
        Main.panel._dateMenu.menu.close();
        showTaskBrowser();
    });
    item.actor.can_focus = false;
    gtgBox.add(item.actor, {y_align: St.Align.END, expand: true, y_fill: false});

    }

function disable () {
}
