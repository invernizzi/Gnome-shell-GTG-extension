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
            let task = tasks[i]
            let task_label = new St.Label({text: task.title,
                                           style_class: 'events-day-task'});
            let task_button = new St.Button();
            task_button.set_child(task_label);
            task_button.connect('clicked', partial(_onTaskClicked, task.id));
            tasksBox.insert_actor(task_button, -1);
        };
    });


    item = new PopupMenu.PopupMenuItem(_("Open GTG"));
    item.connect('activate', function () {
        Main.panel._dateMenu.menu.close();
        showTaskBrowser();
    });
    item.actor.can_focus = false;
    gtgBox.add(item.actor, {y_align: St.Align.END, expand: true, y_fill: false});

    global.log('complete');
    }

function disable () {
}
