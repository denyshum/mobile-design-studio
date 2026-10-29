import { el, button, icon, heading, makeSortable, publicationLabel } from './controls.js';

export function renderCollections({main, collections, records, image, dialog, save}) {
    main.append(heading('Добірки'));

    const recordFor = id => records.find(record => record.id === id);

    const labels = ['Перше місце ліворуч','Друге місце ліворуч','Перше місце праворуч','Друге місце праворуч'];

    async function pick(current,used,label,apply) {
        if (!dialog.open(label,'Оберіть проєкт. Зайняті в цій добірці записи позначені.',{picker:true})) {
            return;
        }

        const choices = el('div','picker-grid');

        for (const record of records) {
            const unavailable = used.includes(record.id) && current !== record.id;
            const option = button('',async () => {
                await dialog.close();
                apply(record.id);
            },'picker-option',unavailable);
            option.setAttribute('aria-pressed',String(current === record.id));
            option.append(image(record),el('strong','',record.name),el('small','',unavailable ? 'Уже в добірці' : record.published ? record.category : 'Не опубліковано'));
            choices.append(option);
        }

        if (!records.length) {
            choices.append(el('p','','Спочатку додайте проєкт'));
        }

        dialog.content.append(choices);

        if (current) {
            dialog.commands.append(button('Залишити місце порожнім',async () => {
                await dialog.close();
                apply(null);
            }));
        }
    }

    for (const name of ['home_featured','home_slider']) {
        const featured = name === 'home_featured';
        const section = el('section',featured ? 'collection-canvas' : 'collection-slider');
        const toolbar = el('div','collection-toolbar');
        toolbar.append(el('h2','',featured ? 'Вибрані проєкти' : 'Інші проєкти'));
        section.append(toolbar);
        let collection = collections[name];
        let values = featured ? Array.from({length:4},(_,n) => collection.items.find(item => item.position === n + 1)?.project_id || null) : collection.items.map(item => item.project_id);
        const emptyNote = featured ? el('p','collection-empty-note','Порожнє місце не займає простір на сайті') : null;
        let busy = false;
        let sortable;

        async function commit(next) {
            if (busy) {
                return;
            }

            busy = true;
            section.inert = true;
            sortable?.option('disabled',true);
            const items = next.flatMap((project_id,n) => project_id ? [{position:n + 1,project_id}] : []);
            const result = await save(name,items,collection.collection_digest);

            if (result.state === 'saved') {
                collection = result.collection;
                values = next;
            }

            if (result.state !== 'uncertain') {
                section.inert = false;
                busy = false;
                sortable?.option('disabled',false);
                draw();
            }
        }

        const canvas = el('div',featured ? 'collection-grid' : 'slider-strip');
        section.append(canvas);

        function slot(value,index) {
            const record = recordFor(value);
            const node = el('div','collection-slot' + (featured ? '' : ' slider-card'));
            node.dataset.project = value || '';

            if (record) {
                node.append(image(record));
            } else {
                node.classList.add('is-empty');
                node.append(el('div','empty-slot',labels[index]));
            }

            if (record && !record.published) {
                node.append(el('span','collection-status',publicationLabel(false)));
            }

            if (featured) {
                const overlay = el('div','slot-overlay');
                const change = button(record ? 'Змінити проєкт' : 'Обрати проєкт +',() => {
                    pick(value,values,labels[index],selected => {
                        const next = [...values];
                        next[index] = selected;
                        commit(next);
                    });
                },'slot-action');
                overlay.append(change);
                node.append(overlay);
            } else {
                const caption = el('div','collection-caption');
                const remove = button('',() => commit(values.filter((_,n) => n !== index)),'icon-action icon-action--danger');
                remove.append(icon('trash'));
                remove.title = 'Прибрати';
                remove.setAttribute('aria-label','Прибрати ' + (record?.name || 'проєкт') + ' зі слайдера');
                caption.append(el('strong','',record?.name || 'Проєкт недоступний'),remove);
                node.append(caption);
            }

            return node;
        }

        function draw() {
            canvas.replaceChildren();

            if (emptyNote) {
                emptyNote.hidden = !values.some(value => !value);
            }

            if (featured) {
                const columns = [el('div','collection-column'),el('div','collection-column')];
                values.forEach((value,n) => columns[n < 2 ? 0 : 1].append(slot(value,n)));
                const note = el('div','collection-note');
                note.append(el('p','','Як ми створюємо мобільні продукти'),el('span','','скоро'));
                columns[0].append(note);
                canvas.append(...columns);
            } else {
                if (!values.length) {
                    canvas.append(el('p','','Додайте перший проєкт до слайдера'));
                }

                values.forEach((value,n) => canvas.append(slot(value,n)));

                sortable = makeSortable(canvas,'.collection-slot',() => {
                    commit([...canvas.querySelectorAll('.collection-slot')].map(node => node.dataset.project));
                });
            }
        }

        draw();

        if (featured) {
            section.append(emptyNote);
        } else {
            section.append(button('Додати проєкт +',() => {
                pick(null,values,'Додати до слайдера',value => {
                    if (value) {
                        commit([...values,value]);
                    }
                });
            }));
        }

        main.append(section);
    }
}


