define(function (require, exports, module) {
    "use strict";

    var CommandManager = brackets.getModule("command/CommandManager"),
        Commands = brackets.getModule("command/Commands"),
        EditorManager = brackets.getModule("editor/EditorManager"),
        Menus = brackets.getModule("command/Menus"),
        ProjectManager = brackets.getModule("project/ProjectManager"),
        NativeFileSystem = brackets.getModule("file/NativeFileSystem").NativeFileSystem,
        ModalBar = brackets.getModule("widgets/ModalBar").ModalBar,
        FileUtils = brackets.getModule("file/FileUtils");

    var modalBar = null,
        TRANSLATE_FILE_KEY = 'korri.citranslate.langfile.';

    function createModalBar(template, autoClose, animate) {
        // Normally, creating a new modal bar will simply cause the old one to close
        // automatically. This can cause timing issues because the focus change might
        // cause the new one to think it should close, too. The old CodeMirror version
        // of this handled it by adding a timeout within which a blur wouldn't cause
        // the modal bar to close. Rather than reinstate that hack, we simply explicitly
        // close the old modal bar before creating a new one.
        if (modalBar) {
            modalBar.close(true, animate);
        }
        modalBar = new ModalBar(template, autoClose, animate);
        $(modalBar).on("commit close", function () {
            modalBar = null;
        });
    }

    function getDialogTextFields() {
        return $("input[type='text']", modalBar.getRoot());
    }
    function escapeString(string)
    {
        return String(string).replace(/'/g, '\\\'').replace(/\n/g, '\\n').replace(/\r/g, '');
    }

    /**
     * Loop and open all language files
     * @param callback Callback called for each file
     * @param end_callback Callback called after the last language file callback has been called
     */
    function openLanguageFiles(callback, end_callback) {
        var projectRoot = ProjectManager.getProjectRoot(),
            translate_key = TRANSLATE_FILE_KEY + projectRoot.name,
            language_file = localStorage[translate_key] || false;

        while (!language_file || language_file == 'false') {
            localStorage[translate_key] = language_file = prompt('Name of the language file (Enter example_lang to translate application/language/english/example_lang.php)');
        }
        projectRoot.getDirectory('application/language', {}, function (dirEntry) {
            var reader = dirEntry.createReader();
            reader.readEntries(function (entries) {
                var count = entries.length;
                entries.forEach(function (dirEntry) {
                    dirEntry.getFile(language_file + '.php', {}, function (languageFile) {

                        CommandManager.execute(Commands.FILE_ADD_TO_WORKING_SET, { fullPath: languageFile.fullPath })
                            .done(function (doc) {
                                callback(doc, dirEntry.name);
                                if (--count == 0 && end_callback) {
                                    end_callback();
                                }
                            });
                    }, function () {
                        localStorage[translate_key] = false;
                        alert('Language file (' + dirEntry.fullPath + '/' + language_file + '.php) not found, will ask for language file name again next time.');
                    });
                });
            }, function (error) {
                alert('Error opening language files');
            });
        }, function () {
            alert('Folder "application/language" does not exist');
        });
    }

    //Translate current line
    function handleTranslate() {
        var editor = EditorManager.getFocusedEditor();

        if (!editor) {
            return;
        }

        var pos = editor.getCursorPos(),
            doc = editor.document,
            originalFileEntry = doc.file,
            filename = originalFileEntry.name,
            is_smarty = filename.match(/\.tpl$/),
            text = '';


        var range = {
            'start': {
                line: pos.line,
                ch: pos.ch
            },
            'end': {
                line: pos.line,
                ch: pos.ch
            }
        }
        var key;
        if (is_smarty) {
            //Left
            do {
                range.start.ch--;
                text = doc.getRange(range.start, range.end);
            } while (range.start.ch > 0 && text.charAt(0) != '{');
            if (text.charAt(0) != '{') {
                return;
            }
            //Right
            do {
                range.end.ch++;
                text = doc.getRange(range.start, range.end);
            } while (range.end.ch < 100 && text.charAt(text.length - 1) != '}');

            if (text.charAt(text.length - 1) != '}') {
                return;
            }
            var res;
            if (!(res = text.match(/^\{l\s+(?:"|')(.*)(?:"|')\s*\}$/))) {
                return;
            }
            key = res[1];
        } else {
            range.start.ch -= 4;
            //Left
            do {
                range.start.ch--;
                text = doc.getRange(range.start, range.end);
            } while (range.start.ch > 0 && text.substr(0, 5) != 'lang(');
            if (text.substr(0, 5) != 'lang(') {
                return;
            }
            //Right
            do {
                range.end.ch++;
                text = doc.getRange(range.start, range.end);
            } while (range.end.ch < 100 && text.charAt(text.length - 1) != ')');

            if (text.charAt(text.length - 1) != ')') {
                return;
            }
            var res;
            if (!(res = text.match(/^lang\(\s*(?:"|')(.*)(?:"|')\s*\)$/))) {
                return;
            }
            key = res[1];
        }
        translateKey(key);
    }

    function translateKey(key) {
        var editor = EditorManager.getFocusedEditor();
        if (!editor) {
            return;
        }
        var originalFileEntry = editor.document.file;

        var lines = {},
            reg = new RegExp('\\$lang\\[(?:\'|")' + key + '(?:\'|")\\]\\s*=\\s*(?:\'|")(.*)(?:\'|")\\s*;?');
        openLanguageFiles(function (doc, language) {
            var text = doc.getText(true),
                matches = text.match(reg);

            if (matches) {
                lines[language] = matches[1].replace(/\\'/g, "'");
            } else {
                alert('Line "' + key + '" not found in "' + language + '" language file.');
            }
        }, function () {
            CommandManager.execute(Commands.FILE_OPEN, { fullPath: originalFileEntry.fullPath });
            var dialog = '<table style="margin-right: 1em">';
            for (var lang in lines) {
                var line = lines[lang];
                dialog +=
                    '<tr>' +
                        '<td style="white-space: nowrap; width: 5%">"' + key + '" in "<strong>' + lang + '</strong>"</td>' +
                        '<td><input style="width: 100%;box-sizing: border-box;height: 30px;" type="text" name="' + lang + '" value="' + line + '"/></td>' +
                        '</tr>';
            }
            dialog += '</table>'

            createModalBar(dialog, true, true);
            var inputs = getDialogTextFields();
            inputs.slice(1).on("keydown", modalBar._handleInputKeydown);

            $(modalBar).on('commit', function (ev) {

                var lines = {};

                inputs.each(function () {
                    var _this = $(this),
                        name = _this.attr('name'),
                        value = _this.val();

                    lines[name] = value;
                });
                openLanguageFiles(function (doc, lang) {
                    var text = doc.getText(),
                        line = "$lang['" + key + "'] = '" + escapeString(lines[lang]) + "';";
                    text = text.replace(reg, line);
                    doc.setText(text);
                }, function () {
                    CommandManager.execute(Commands.FILE_OPEN, { fullPath: originalFileEntry.fullPath });
                });

            });
        });
    }

    //Transform text into language
    function handleConvert() {
        var editor = EditorManager.getFocusedEditor();

        if (!editor) {
            return;
        }

        var sel = editor.getSelection(),
            hasSelection = (sel.start.line !== sel.end.line) || (sel.start.ch !== sel.end.ch);

        if (!hasSelection) {
            return;
        }

        var doc = editor.document,
            originalFileEntry = doc.file,
            filename = originalFileEntry.name,
            is_smarty = filename.match(/\.tpl$/),
            selectedText = doc.getRange(sel.start, sel.end);
        if (!is_smarty) {
            selectedText = selectedText.replace(/^('|")/, '').replace(/('|")$/, '');
        }
        var queryDialog = 'Clef de langue : <input type="text" style="width: 10em"/> (pour le texte <em>' + selectedText + '</em>)';

        createModalBar(queryDialog, true, true);
        var input = getDialogTextFields().val(filename.replace(/\.([a-z]{3})$/, '') + '.').focus();
        $(modalBar).on('commit', function () {
            var key = input.val(),
                lang_tag = is_smarty ? '{l "' + key + '"}' : "lang('" + key + "')";

            if (!key) {
                return;
            }

            doc.replaceRange(lang_tag, sel.start, sel.end);

            openLanguageFiles(function (doc, lang) {
                var text = doc.getText();
                text += "\n$lang['" + key + "'] = '" + escapeString(selectedText) + "';";
                doc.setText(text);
            }, function () {
                CommandManager.execute(Commands.FILE_OPEN, { fullPath: originalFileEntry.fullPath });
                translateKey(key);
            });

        });
    }

    var menu = Menus.getMenu(Menus.AppMenuBar.EDIT_MENU);

    // Commands
    var COMMAND_ID_CONVERT = "korri.citranslate.convert";   // package-style naming to avoid collisions
    CommandManager.register("CITranslate: Translate Text", COMMAND_ID_CONVERT, handleConvert);

    var COMMAND_ID_EDIT = "korri.citranslate.edit";   // package-style naming to avoid collisions
    CommandManager.register("CITranslate: Edit Translation", COMMAND_ID_EDIT, handleTranslate);


    menu.addMenuDivider();
    menu.addMenuItem(COMMAND_ID_CONVERT, 'Ctrl-Alt-L');
    menu.addMenuItem(COMMAND_ID_EDIT, 'Ctrl-Shift-Alt-L');

    exports.handleConvert = handleConvert;
    exports.handleTranslate = handleTranslate;
});
