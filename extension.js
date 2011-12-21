const St = imports.gi.St;
const Main = imports.ui.main;
const Lang = imports.lang;
const Clutter = imports.gi.Clutter;
const DBus = imports.dbus;

function init () {
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
              { name: 'OpenTaskEditor',
                inSignature: 's',
                outSignature: '' }],
};

const Gtg = DBus.makeProxyClass(GtgIFace);
const _gtg = new Gtg(DBus.session, 'org.gnome.GTG', '/org/gnome/GTG');

function GetActiveTasks (tags, callback) {
    function handler(results, error) {
        if (error != null)
            global.log("Error retrieving GTG tasks: "+error);
        else
            callback(results);
    }
    _gtg.GetActiveTasksRemote(tags, handler);
}

function OpenTaskEditor(task_id) {
    _gtg.OpenTaskEditorRemote(task_id);
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

    gtgBox = new St.BoxLayout({style_class: 'calendar'});
    gtgBox.set_vertical(true);
    calendarArea.add_actor(gtgBox);

    GetActiveTasks(['@all'], function (tasks) {
        Main.gtg = tasks;
        for (var i in tasks) {
            let task_label = new St.Label({text: tasks[i].title,
                                           style_class: 'events-day-task'});
            // task_label.connect('clicked', function () {
            //     OpenTaskEditor(tasks[i].id);
            // });
            gtgBox.insert_actor(task_label, -1);
        };
    });

    global.log('complete');
    }

function disable () {
}
