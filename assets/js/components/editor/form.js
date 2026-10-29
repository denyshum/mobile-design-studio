import { el, button, icon, actions, field, heading, section, makeSortable, toast, clearToast, notice, fieldError, publicationLabel } from './controls.js';
import { slugBase } from './slug.js';
import { prepareCover } from './image.js';

export function createContentForm({kind, record = null, image, onSave, onBack, onDirty, draft}) {
    const vacancy = kind === 'vacancy';
    const fresh = !record;
    const form = el('form','editor-form');
    form.noValidate = true;
    let validationNotice;
    const coverNoticeOwner = Symbol('cover');
    const disposers = [];
    let blob = draft?.blob || null;
    let previewUrl;
    let generation = 0;
    let preparing = false;
    let invalidImage = false;
    let dirty = Boolean(draft);
    const lists = new Map();
    const toolbar = el('div','form-toolbar');
    const status = el('span','status-pill', publicationLabel(!fresh && (vacancy ? record.status === 'open' : record.published)));
    const save = button(fresh ? 'Зберегти чернетку' : 'Зберегти зміни', () => submit(false),fresh ? 'small-action' : 'primary-action');
    const commands = actions(save);

    if (fresh) {
        commands.append(button('Опублікувати', () => submit(true),'primary-action'));
    }

    toolbar.append(status,commands);
    form.append(toolbar);
    const fields = el('div','form-fields');
    form.append(fields);

    function markDirty() {
        dirty = true;
        onDirty?.();
    }

    form.addEventListener('input',markDirty);

    function input(key,label,options = {}) {
        const value = draft?.values?.[key] ?? record?.[key] ?? '';
        const wrapper = field(key,label,value,options);
        const control = wrapper.querySelector('input,textarea');
        control.name = key;
        control.required = label.endsWith('*');

        return wrapper;
    }

    const grid = el('div','form-grid form-basics');
    const summary = el('section','form-summary');
    summary.append(input('name',vacancy ? 'Назва посади *' : 'Назва проєкту *',{max:160}));

    if (!vacancy) {
        summary.append(input('category','Категорія *',{max:160}));
    }

    const id = field('slug','ID',record?.id || slugBase(draft?.values?.name || '',kind),{readonly:true,max:80});

    if (fresh) {
        summary.querySelector('input').addEventListener('input',event => {
            id.querySelector('input').value = event.target.value ? slugBase(event.target.value,kind) : '';
        });

        if (!draft?.values?.name) {
            id.querySelector('input').value = '';
        }
    }

    summary.append(id);

    function repeat(title,key,facts = false) {
        const group = section(title);
        const list = el('div','repeat-list');
        const maximum = facts ? 50 : 100;
        let index = 0;

        function renumber() {
            [...list.querySelectorAll('.item-editor')].forEach((row,n) => {
                if (!facts) {
                    row.querySelector('label').textContent = 'Пункт ' + (n + 1);
                }

                row.querySelector('.drag-handle')?.setAttribute('aria-label','Перемістити: ' + (facts ? 'факт ' : 'пункт ') + (n + 1));
            });

            addButton.disabled = list.querySelectorAll('.item-editor').length >= maximum;
        }

        function add(value = facts ? {label:'',value:''} : '') {
            const row = el('div','item-editor');
            const controls = el('div','item-editor__fields' + (facts ? ' item-editor__fields--fact' : ''));
            const identity = key + '-' + index++;

            if (facts) {
                controls.append(field(identity + '-label','Підпис',value.label,{max:160}),field(identity + '-value','Значення',value.value,{max:1000}));
            } else {
                controls.append(field(identity,'Пункт',value,{multiline:true,rows:1,max:2000}));
            }

            for (const control of controls.querySelectorAll('input,textarea')) {
                control.required = true;

                if (control.tagName === 'TEXTAREA') {
                    const fit = () => {
                        if (control.isConnected) {
                            control.style.height = 'auto';
                            const border = parseFloat(getComputedStyle(control).borderTopWidth) + parseFloat(getComputedStyle(control).borderBottomWidth);
                            control.style.height = Math.min(control.scrollHeight + border,12 * parseFloat(getComputedStyle(document.documentElement).fontSize)) + 'px';
                        }
                    };

                    control.addEventListener('input',fit);
                    let lastWidth;
                    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(entries => {
                        const width = entries[0].contentRect.width;

                        if (width !== lastWidth) {
                            lastWidth = width;
                            fit();
                        }
                    }) : null;
                    observer?.observe(control);
                    disposers.push(() => observer?.disconnect());
                    requestAnimationFrame(fit);
                    document.fonts.ready.then(fit);
                }
            }

            const remove = button('', () => {
                const next = row.nextElementSibling?.querySelector('input,textarea') || row.previousElementSibling?.querySelector('input,textarea');
                row.remove();
                renumber();
                markDirty();
                (next || addButton).focus();
            },'icon-action icon-action--danger');
            remove.setAttribute('aria-label','Прибрати пункт');
            remove.title = 'Прибрати';
            remove.append(icon('trash'));
            row.append(controls,remove);
            list.append(row);

            makeSortable(list,'.item-editor',() => {
                renumber();
                markDirty();
            });

            renumber();
        }

        const addButton = button(facts ? 'Додати факт +' : 'Додати пункт +', () => {
            if (list.querySelectorAll('.item-editor').length < maximum) {
                add();
                markDirty();
                list.querySelector('.item-editor:last-of-type input,.item-editor:last-of-type textarea')?.focus();
            }
        });

        for (const value of draft?.values?.[key] ?? record?.[key] ?? []) {
            add(value);
        }

        group.append(list,addButton);
        lists.set(key,{list,facts});

        return group;
    }

    if (vacancy) {
        const name = summary.querySelector('.field');
        grid.append(id,input('format','Формат роботи *',{max:160}),input('employment','Зайнятість *',{max:160}),input('salary','Оплата',{max:500}));
        const descriptions = el('div','form-grid form-grid--descriptions');
        descriptions.append(input('intro','Вступ *',{multiline:true,max:2000}),input('experience','Досвід',{multiline:true,max:500}));
        fields.append(name,grid,descriptions);

        for (const [key,title] of [['responsibilities','Обов’язки'],['expectations','Очікування'],['collaboration','Співпраця']]) {
            form.append(repeat(title,key));
        }
    } else {
        const cover = el('section','cover-editor');
        cover.append(el('h2','',fresh ? 'Обкладинка *' : 'Обкладинка'));
        const file = el('input','file-input');
        file.id = 'cover-file';
        file.type = 'file';
        file.accept = 'image/jpeg,image/png,image/webp';
        file.setAttribute('aria-label','Обрати обкладинку');
        const upload = el('label','cover-upload');
        upload.htmlFor = file.id;
        const prompt = el('span','cover-upload__prompt');
        const caption = el('strong','',record || blob ? 'Замінити зображення' : 'Додати зображення');
        prompt.append(icon('upload'),caption,el('span','','JPEG, PNG, WebP'));
        upload.append(prompt);

        function showBlob(value) {
            if (previewUrl) {
                URL.revokeObjectURL(previewUrl);
            }

            upload.querySelector('img')?.remove();
            previewUrl = URL.createObjectURL(value);
            const preview = el('img','cover-preview');
            preview.alt = '';
            preview.src = previewUrl;
            upload.prepend(preview);
            caption.textContent = 'Замінити зображення';
        }

        if (blob) {
            showBlob(blob);
        } else if (record) {
            upload.prepend(image(record,'cover-preview'));
        }

        file.addEventListener('change',async () => {
            const selected = file.files[0];

            if (!selected) {
                return;
            }

            const current = ++generation;
            preparing = true;
            invalidImage = false;
            commands.querySelectorAll('button').forEach(node => { node.disabled = true; });
            caption.textContent = 'Готуємо зображення…';

            try {
                const prepared = await prepareCover(selected);

                if (current !== generation) {
                    return;
                }

                blob = prepared;
                showBlob(blob);
                markDirty();
                await clearToast(coverNoticeOwner);
            } catch (error) {
                if (current === generation) {
                    invalidImage = !blob && !record;
                    file.value = '';
                    caption.textContent = invalidImage ? 'Оберіть інше зображення' : 'Замінити зображення';
                    toast(error instanceof RangeError ? 'Пошкоджене зображення. Оберіть інший файл' : error.message,{kind:'error',owner:coverNoticeOwner});
                }
            } finally {
                if (current === generation) {
                    preparing = false;
                    commands.querySelectorAll('button').forEach(node => { node.disabled = false; });
                }
            }
        });

        cover.append(file,upload);
        grid.append(summary,cover);
        const descriptions = el('div','form-grid form-grid--descriptions');
        descriptions.append(input('description','Короткий опис *',{multiline:true,max:2000}),input('image_alt','Опис зображення *',{multiline:true,max:500}));
        fields.append(grid,descriptions);
        const copy = section('Зміст кейсу');

        for (const [key,title] of [['task','Завдання'],['solution','Рішення'],['result','Результат']]) {
            copy.append(input(key,title + ' *',{multiline:true,max:10000}));
        }

        form.append(copy,repeat('Факти','facts',true));
    }

    function values() {
        const keys = vacancy ? ['name','intro','format','employment','salary','experience'] : ['name','category','description','image_alt','task','solution','result'];
        const result = Object.fromEntries(keys.map(key => [key,form.elements.namedItem(key).value.trim() || (['salary','experience'].includes(key) ? null : '')]));

        for (const [key,{list,facts}] of lists) {
            result[key] = [...list.querySelectorAll('.item-editor')].map(row => {
                const controls = [...row.querySelectorAll('input,textarea')].map(node => node.value.trim());

                return facts ? {label:controls[0],value:controls[1]} : controls[0];
            });
        }

        return result;
    }

    function focusInvalidField(control) {
        const target = control.type === 'file' ? form.querySelector('.cover-upload__prompt') : control.closest('.field');

        const align = () => {
            if (!form.isConnected || !target?.isConnected || document.activeElement !== control) {
                return;
            }

            const bounds = target.getBoundingClientRect();
            const header = document.querySelector('.workspace-header')?.getBoundingClientRect().bottom || 0;
            const style = getComputedStyle(toolbar);
            const toolbarBottom = style.position === 'sticky' ? parseFloat(style.top) + toolbar.getBoundingClientRect().height : 0;
            const gap = parseFloat(getComputedStyle(document.documentElement).fontSize);
            const obstruction = Math.max(header, toolbarBottom);
            const inset = Math.min(gap, Math.max(0, (innerHeight - obstruction - bounds.height) / 2));
            const top = obstruction + inset;

            if (bounds.top < top || bounds.bottom > innerHeight - inset) {
                window.scrollBy({ top: bounds.top - top, behavior: 'instant' });
            }
        };

        control.focus({ preventScroll: true });
        align();

        requestAnimationFrame(() => {
            align();
            requestAnimationFrame(align);
        });

        document.fonts?.ready.then(() => requestAnimationFrame(align));
    }

    async function submit(publish) {
        if (preparing || invalidImage) {
            toast(preparing ? 'Зачекайте завершення підготовки зображення' : 'Оберіть придатне зображення',{kind:'error',owner:coverNoticeOwner});

            return;
        }

        let first;

        for (const control of form.querySelectorAll('input,textarea')) {
            control.setCustomValidity('');
            const missing = control.required && !control.value.trim();
            const message = missing ? 'Заповніть це поле' : control.validity.valid ? '' : 'Перевірте введене значення';
            fieldError(control,message);

            if (message && !first) {
                first = control;
            }
        }

        validationNotice?.remove();

        if (first) {
            validationNotice = notice('Перевірте виділені поля','','error');
            form.before(validationNotice);
            focusInvalidField(first);

            return;
        }

        if (!vacancy && fresh && !blob) {
            toast('Додайте обкладинку',{kind:'error',owner:coverNoticeOwner});
            focusInvalidField(form.querySelector('.file-input'));

            return;
        }

        await onSave(controller,publish);
    }

    form.addEventListener('submit',event => {
        event.preventDefault();
        submit(false);
    });

    form.addEventListener('input',event => {
        if (typeof event.target.setCustomValidity === 'function') {
            event.target.setCustomValidity('');
            fieldError(event.target,'');

            if (!form.querySelector('[aria-invalid="true"]')) {
                validationNotice?.remove();
            }
        }
    });

    const previousDisabled = new Map();
    const controller = {
        form, record, kind,
        heading:heading(fresh ? vacancy ? 'Нова вакансія' : 'Новий проєкт' : vacancy ? 'Редагування вакансії' : 'Редагування проєкту',button('← До списку',onBack)),
        values,

        get blob() { return blob; },

        get dirty() { return dirty; },

        set dirty(value) { dirty = value; },

        setBusy(value) {
            for (const node of form.querySelectorAll('button,input,textarea')) {
                if (value) {
                    previousDisabled.set(node,node.disabled);
                    node.disabled = true;
                } else {
                    node.disabled = previousDisabled.get(node) || false;
                }
            }

            form.setAttribute('aria-busy',String(value));

            if (!value) {
                previousDisabled.clear();
            }
        },

        capture() { return {values:values(),blob}; },

        dispose() {
            validationNotice?.remove();
            generation += 1;

            if (previewUrl) {
                URL.revokeObjectURL(previewUrl);
            }

            for (const dispose of disposers) {
                dispose();
            }
        },
    };

    return controller;
}


