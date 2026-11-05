import { createBriefsController } from '../components/editor/briefs.js';
import { createEditorClient, editorSessionKey, editorEventsKey } from '../data/editor.js';
import { catalogResource } from '../data/projects.js';
import { searchQuery } from '../data/search.js';
import { validId } from '../data/client.js';
import { createModal, finishScrollRestore } from '../components/modal.js';
import { el,button,icon,heading,field,fieldError,notice,motion,toast,clearToast,makeSortable,disposeSortables,publicationLabel,rememberFocus,positionRecordMenu } from '../components/editor/controls.js';
import { createEditorDialog } from '../components/editor/dialog.js';
import { createCoverImages } from '../components/editor/media.js';
import { createContentForm } from '../components/editor/form.js';
import { renderCollections } from '../components/editor/collections.js';
import { createMutationController } from '../components/editor/mutations.js';

const main = document.querySelector('.editor-main');
const header = document.querySelector('.workspace-header');
const panel = createEditorDialog(document.querySelector('.state-dialog'));
const menuNode = document.querySelector('.workspace-menu');
const menuTrigger = document.querySelector('[data-menu]');
const menu = createModal(menuNode,{closeAnimation:async () => {
    menuNode.dataset.closing = 'true';
    await motion(menuNode,[{opacity:1},{opacity:0}],180);
    delete menuNode.dataset.closing;
}});
let client;
let briefs;
let mutations;
let actor;
let authorized = false;
let form;
let suspended;
let uncertainView;
let loggingOut = false;
let signingIn = false;
let registeredUser;
let accessVersion = 0;
let viewVersion = 0;
let viewAbort = new AbortController();
let historyIndex = history.state?.editorIndex || 0;
let restoringHistory = false;
let keyboardActivation = false;
const routes = new Set(['projects','vacancies','collections','project-new','project-edit','vacancy-new','vacancy-edit','briefs','login']);
const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel(editorEventsKey) : null;

function currentRoute() {
    const query = new URLSearchParams(location.search);

    return {view:query.get('view') || 'projects',id:query.get('id'),filter:query.get('filter') || 'active',query:query.get('view') === 'briefs' ? searchQuery(query.get('q'),80) : ''};
}

function pageTitle(view) {
    if (view === 'briefs') {
        return 'Звернення';
    }
    return view.startsWith('vacancy') || view === 'vacancies' ? 'Вакансії' : view === 'collections' ? 'Добірки' : 'Проєкти';
}

function setHeader(value) {
    authorized = value;
    if (value) {
        briefs?.start();
    } else {
        briefs?.stop();
    }
    header.querySelector('.workspace-nav').hidden = !value;
    header.querySelector('.workspace-signout').hidden = !value;
    header.querySelector('.workspace-return').hidden = value;
    menuTrigger.hidden = !value;
    const current = pageTitle(currentRoute().view);

    for (const link of document.querySelectorAll('.workspace-nav a,.workspace-menu__links a')) {
        if (new URL(link.href).searchParams.get('view') === 'briefs' ? currentRoute().view === 'briefs' : link.textContent === current) {
            link.setAttribute('data-current','page');
        } else {
            link.removeAttribute('data-current');
        }
    }
}

function clearView() {
    finishScrollRestore();
    uncertainView = null;
    viewAbort.abort();
    viewAbort = new AbortController();
    form?.dispose();
    form = null;
    disposeSortables();
    main.replaceChildren();
    delete main.dataset.ready;
    main.classList.remove('editor-main--access');
    document.body.classList.remove('editor-page--editing', 'editor-page--brief-detail');
}

function focusHeading() {
    const title = main.querySelector('h1');

    if (title) {
        title.tabIndex = -1;
        title.focus({preventScroll:true});
    }
}

function resource(title,text,action,label = 'Спробувати ще раз',{loading = false} = {}) {
    const node = el('section','state-resource');

    if (loading) {
        const spinner = el('span','loading-ring');
        node.append(spinner);
        node.setAttribute('role','status');
    }

    node.append(el('h2','',title));

    if (text) {
        node.append(el('p','',text));
    }

    if (action) {
        node.append(button(label,action,'primary-action'));
    }

    return node;
}

async function canLeave() {
    if (mutations?.pending) {
        mutations.announcePending();

        return false;
    }

    if (mutations?.busy) {
        toast('Зачекайте завершення поточної дії',{kind:'busy'});

        return false;
    }

    if (!form?.dirty) {
        return true;
    }

    return panel.confirm({
        heading:'Є незбережені зміни',text:'Відкинути зміни й перейти?',label:'Відкинути зміни',

        execute:async () => {
            form.dirty = false;

            return true;
        },
    });
}

function writeLocation(target,replace = false) {
    if (!replace) {
        historyIndex += 1;
    }

    history[replace ? 'replaceState' : 'pushState']({...history.state,editorIndex:historyIndex},'',target);
}

function setBriefSearch(query,replace = false) {
    const target = new URL(location.href);
    target.searchParams.delete('q');

    if (query) {
        target.searchParams.set('q',query);
    }

    if (target.href !== location.href) {
        writeLocation(target,replace);
    }
}

async function navigate(view,id,{replace = false,focus = keyboardActivation,resetScroll = true,animate = true,record,filter,query = currentRoute().query} = {}) {
    await menu.close();

    if (!routes.has(view) || !await canLeave()) {
        return;
    }

    await menu.close();

    if (!record) {
        await clearToast();
    }

    const target = new URL('editor.html',location.href);
    target.searchParams.set('view',view);
    if (view === 'briefs') {
        target.searchParams.set('filter',filter || currentRoute().filter || 'active');

        if (query) {
            target.searchParams.set('q',searchQuery(query,80));
        }
    }

    if (id) {
        target.searchParams.set('id',id);
    }

    writeLocation(target,replace);
    finishScrollRestore();

    if (resetScroll) {
        window.scrollTo({top:0,behavior:'instant'});
    }

    await renderCurrent({focus,preserveScroll:!resetScroll,animate,recordOverride:record});
}

async function loginView(error) {
    clearView();
    setHeader(false);
    main.classList.add('editor-main--access');
    const shell = el('div','access-layout');
    const artwork = el('div','access-artwork');
    const login = el('form','login-form');
    shell.append(artwork,login);
    main.append(shell);
    const signal = viewAbort.signal;

    catalogResource.load().then(result => {
        if (result.status === 'success' && !signal.aborted) {
            for (const record of [result.data[0],result.data[4] || result.data[1]].filter(Boolean)) {
                const image = el('img');
                image.src = record.image;
                image.alt = '';
                image.width = record.imageWidth;
                image.height = record.imageHeight;
                image.addEventListener('error',() => image.remove(),{once:true});
                artwork.append(image);
            }
        }
    });

    if (error?.code === 'LOGOUT_UNCONFIRMED') {
        login.append(el('h1','','Вихід не підтверджено'),notice('Перевірте з’єднання та повторіть спробу','','error'),button('Повторити',() => explicitLogout({confirm:false}),'primary-action'));

        return;
    }

    if (error?.status === 403) {
        const message = error.registered
            ? notice('Акаунт створено','Для керування сайтом потрібен доступ редактора.')
            : notice('Цей акаунт не може редагувати сайт','','error');
        login.append(el('h1','','Немає доступу редактора'),message,button('Вийти',() => explicitLogout({confirm:false}),'primary-action'));

        return;
    }

    const target = new URL(location.href);
    const registering = target.searchParams.has('register');
    const title = el('h1','',registering ? 'Створити акаунт' : error?.status === 401 ? 'Увійдіть знову' : 'Вхід редактора');
    login.append(title);

    if (error) {
        login.append(notice(error.status === 401 ? 'Сесія завершилась' : 'Не вдалося перевірити доступ','','error'));
    }

    const email = field('email','Електронна пошта','',{type:'email'});
    const emailInput = email.querySelector('input');
    emailInput.required = true;
    emailInput.autocomplete = 'username';
    const password = authPassword('password','Пароль',registering ? 'new-password' : 'current-password');
    const repeat = registering ? authPassword('repeat-password','Повторіть пароль','new-password') : null;
    const submitLabel = registering ? 'Зареєструватися' : 'Увійти';
    const submit = button(submitLabel,null,'primary-action');
    submit.type = 'submit';
    const alternate = el('a','small-action',registering ? '← До входу' : 'Створити акаунт');

    if (registering) {
        target.searchParams.delete('register');
        password.input.minLength = 6;
        login.append(email,password.wrapper,repeat.wrapper);
    } else {
        target.searchParams.set('register','1');
        login.append(email,password.wrapper);
    }

    alternate.href = target.href;
    login.append(submit,alternate);
    alternate.addEventListener('click',async event => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
            return;
        }

        event.preventDefault();

        if (!signingIn) {
            historyIndex += 1;
            history.pushState({editorIndex:historyIndex},'',target);
            await loginView();

            if (event.detail === 0) {
                const heading = main.querySelector('.login-form h1');
                heading.tabIndex = -1;
                heading.focus();
            }
        }
    });

    for (const control of [emailInput,password.input,repeat?.input].filter(Boolean)) {
        control.addEventListener('input',() => {
            control.removeAttribute('data-invalid');

            if (repeat) {
                fieldError(repeat.input,'');
            }
        });
    }

    login.addEventListener('submit',async event => {
        event.preventDefault();

        if (signingIn) {
            return;
        }

        if (repeat && repeat.input.value !== password.input.value) {
            fieldError(repeat.input,'Паролі не збігаються');
            repeat.input.focus();

            return;
        }

        const focused = document.activeElement;
        const restoreFocus = rememberFocus(login.contains(focused) && focused.tagName === 'INPUT' ? focused : password.input);
        const controls = login.querySelectorAll('input,button');
        let failed = false;
        signingIn = true;

        for (const control of controls) {
            control.disabled = true;
        }

        submit.textContent = registering ? 'Реєструємо…' : 'Входимо…';
        login.querySelector('.state-notice')?.remove();

        try {
            const credentials = {email:emailInput.value.trim(),password:password.input.value};
            const result = registering ? await client.auth.signUp(credentials) : await client.auth.signInWithPassword(credentials);

            if (result.error) {
                throw result.error;
            }

            if (registering) {
                if (!result.data.session) {
                    throw new Error('Сесію реєстрації не створено');
                }

                registeredUser = result.data.session.user.id;
                repeat.input.value = '';
                const current = new URL(location.href);
                current.searchParams.delete('register');
                history.replaceState({editorIndex:historyIndex},'',current);
            }

            client.cancelLogoutRetry();
            client.auth.startAutoRefresh();
            password.input.value = '';
            await checkAccess();
        } catch (failure) {
            failed = true;
            const network = !failure.status || failure.status >= 500;
            const message = network ? 'Перевірте з’єднання та спробуйте ще раз' : registering
                ? 'Перевірте введені дані або перейдіть до входу'
                : 'Перевірте пошту та пароль';
            email.before(notice(registering ? 'Не вдалося створити акаунт' : 'Не вдалося увійти',message,'error'));

            if (!registering && !network) {
                emailInput.setAttribute('data-invalid','true');
                password.input.setAttribute('data-invalid','true');
            }
        } finally {
            signingIn = false;

            for (const control of controls) {
                control.disabled = false;
            }

            submit.textContent = submitLabel;

            if (failed) {
                restoreFocus();
            }
        }
    });
}

function authPassword(id,label,autocomplete) {
    const wrapper = field(id,label,'',{type:'password'});
    const input = wrapper.querySelector('input');
    input.required = true;
    input.autocomplete = autocomplete;
    const box = el('div','password-control');
    input.replaceWith(box);
    const toggle = button('',() => {
        const visible = input.type === 'password';
        input.type = visible ? 'text' : 'password';
        toggle.title = visible ? 'Приховати пароль' : 'Показати пароль';
        toggle.replaceChildren(icon(visible ? 'eye-off' : 'eye'));
    },'icon-action password-toggle');
    toggle.title = 'Показати пароль';
    toggle.append(icon('eye'));
    box.append(input,toggle);

    return {wrapper,input};
}

async function renderList(kind,image,signal) {
    const entity = kind === 'project' ? 'projects' : 'vacancies';
    const result = await client.catalog(entity,signal);
    const list = el('div','record-list');
    const records = result.records;
    let digest = result.order_digest;
    const tokens = Object.fromEntries(records.map(record => [record.id,record.record_token]));

    for (const record of records) {
        const row = el('article','record-row' + (kind === 'vacancy' ? ' record-row--vacancy' : ''));
        row.dataset.record = record.id;
        const summary = el('div','record-summary');

        if (kind === 'project') {
            summary.append(image(record,'record-thumbnail'));
        }

        const copy = el('div','record-copy');
        copy.append(el('h2','',record.name),el('p','',kind === 'project' ? record.category : record.format + ' · ' + record.employment));
        summary.append(copy);
        let visible = kind === 'project' ? record.published : record.status === 'open';
        const label = publicationLabel(visible);
        const status = el('span','record-status' + (visible ? '' : ' record-status--hidden'),label);
        row.append(summary,status);
        const commands = el('div','record-actions');
        commands.append(button('Редагувати',() => navigate(kind + '-edit',record.id),'record-action record-action--primary'));
        const menu = el('details','record-menu');
        menu.setAttribute('name','record-actions');
        const menuObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(() => positionRecordMenu(menu)) : null;

        menu.addEventListener('toggle',() => {
            menuObserver?.disconnect();

            if (menu.open) {
                positionRecordMenu(menu);
                menuObserver?.observe(menu);
                menuObserver?.observe(menu.querySelector('.record-menu__items'));
            }
        });

        signal.addEventListener('abort',() => menuObserver?.disconnect(),{once:true});
        const trigger = el('summary','record-action','Інші дії ⌄');
        const items = el('div','record-menu__items');
        const visibilityButton = button(visible ? 'Приховати' : 'Опублікувати',async () => {
            const restoreFocus = rememberFocus(visibilityButton);
            let failed = false;
            visibilityButton.disabled = true;

            try {
                let text = visible ? kind === 'vacancy' ? 'Вакансія зникне зі сторінки кар’єри. Її можна буде опублікувати знову' : 'Проєкт зникне із сайту. Ви зможете опублікувати його знову' : 'Запис стане доступним на сайті';

                if (visible && kind === 'project') {
                    const collections = await client.read('collections',{},signal);

                    if (signal.aborted) {
                        return;
                    }

                    const names = [['home_featured','Вибрані проєкти'],['home_slider','Інші проєкти']]
                        .filter(([key]) => collections[key].items.some(item => item.project_id === record.id))
                        .map(([,name]) => '«' + name + '»');

                    if (names.length) {
                        text = 'Проєкт зникне із сайту та ' + (names.length === 1 ? 'добірки ' : 'добірок ') + names.join(', ') + '. ' + (names.length === 1 ? 'Після повторної публікації картка повернеться на те саме місце' : 'Після повторної публікації картки повернуться на ті самі місця');
                    }
                }

                await panel.confirm({
                    heading:(visible ? 'Приховати «' : 'Опублікувати «') + record.name + '»?',
                    text,
                    label:visible ? 'Приховати' : 'Опублікувати',

                    execute:async () => {
                        const payload = kind === 'project' ? {published:!visible} : {status:visible ? 'closed' : 'open'};
                        const expected = {record_token:record.record_token,...(kind === 'project' ? {published:visible} : {status:record.status})};
                        const changed = await mutations.run({action:kind + '.visibility',payload,expected,context:{id:record.id},message:visible ? 'Запис приховано' : 'Запис опубліковано'});

                        if (changed.state === 'saved') {
                            const previousCover = record.cover_revision;
                            Object.assign(record,changed.record);
                            copy.querySelector('h2').textContent = record.name;
                            copy.querySelector('p').textContent = kind === 'project' ? record.category : record.format + ' · ' + record.employment;

                            if (kind === 'project' && previousCover !== record.cover_revision) {
                                row.querySelector('.record-thumbnail').replaceWith(image(record,'record-thumbnail'));
                            }

                            visible = kind === 'project' ? record.published : record.status === 'open';
                            status.textContent = publicationLabel(visible);
                            status.classList.toggle('record-status--hidden',!visible);
                            visibilityButton.textContent = visible ? 'Приховати' : 'Опублікувати';

                            return true;
                        }

                        return false;
                    },
                });
            } catch (error) {
                if (!signal.aborted) {
                    if ([401,403].includes(error.status)) {
                        accessLost(error);
                    } else {
                        failed = true;
                        toast('Не вдалося перевірити добірки. Повторіть спробу',{kind:'error'});
                    }
                }
            } finally {
                visibilityButton.disabled = false;

                if (failed && !signal.aborted) {
                    restoreFocus();
                }
            }
        },'record-action');
        items.append(visibilityButton);

        items.append(button('Видалити',async () => {
            try {
                const preview = await client.read('delete-preview',{entity,id:record.id});

                if (preview.record.record_token !== record.record_token) {
                    toast('Запис змінився. Оновіть список перед видаленням',{kind:'error'});

                    return;
                }

                const text = 'Запис буде видалено із сайту. Відновити його не вдасться' + (preview.placements.length ? '. Також буде прибрано розміщення в добірках: ' + preview.placements.length : '');
                const saved = await panel.confirm({
                    heading:'Видалити «' + preview.record.name + '»?',text,label:'Видалити',danger:true,

                    execute:async () => {
                        const deleted = await mutations.run({
                            action:kind + '.delete',payload:{id:record.id},
                            expected:{record_token:record.record_token,delete_digest:preview.delete_digest},
                            context:{id:record.id},message:kind === 'project' ? 'Проєкт видалено' : 'Вакансію видалено',
                        });

                        return deleted.state === 'saved';
                    },
                });

                if (saved) {
                    const rows = [...list.querySelectorAll('.record-row')];
                    const index = rows.indexOf(row);
                    const next = rows[index + 1] || rows[index - 1];
                    row.remove();
                    records.splice(records.indexOf(record),1);
                    delete tokens[record.id];
                    next?.querySelector('summary').focus({preventScroll:true});
                    sortable.option('disabled',true);

                    if (!records.length) {
                        list.replaceWith(resource(kind === 'project' ? 'Проєктів ще немає' : 'Вакансій ще немає','',() => navigate(kind + '-new'),kind === 'project' ? 'Створити проєкт' : 'Створити вакансію'));

                        if (keyboardActivation) {
                            focusHeading();
                        }

                        return;
                    }

                    try {
                        const actual = await client.catalog(entity,signal);
                        const displayed = [...list.querySelectorAll('.record-row')].map(node => [node.dataset.record,tokens[node.dataset.record]]);

                        if (JSON.stringify(actual.records.map(record => [record.id,record.record_token])) === JSON.stringify(displayed)) {
                            digest = actual.order_digest;
                            sortable.option('disabled',false);
                        } else {
                            toast('Список змінився. Оновіть його перед перестановкою',{kind:'error',label:'Оновити дані',action:() => renderCurrent({focus:false})});
                        }
                    } catch (error) {
                        if (!signal.aborted) {
                            if ([401,403].includes(error.status)) {
                                accessLost(error);
                            } else {
                                toast('Не вдалося оновити список для перестановки',{kind:'error',action:() => renderCurrent({focus:false})});
                            }
                        }
                    }
                }
            } catch (error) {
                handleReadError(error);
            }
        },'record-action record-action--delete'));

        menu.append(trigger,items);
        commands.append(menu);
        row.append(commands);
        list.append(row);
    }

    if (!records.length) {
        return resource(kind === 'project' ? 'Проєктів ще немає' : 'Вакансій ще немає','',() => navigate(kind + '-new'),kind === 'project' ? 'Створити проєкт' : 'Створити вакансію');
    }

    const sortable = makeSortable(list,'.record-row',async before => {
        sortable.option('disabled',true);
        const ordered = [...list.querySelectorAll('.record-row')].map(row => row.dataset.record);
        const result = await mutations.run({
            action:'catalog.reorder',payload:{entity,ordered_ids:ordered},expected:{order_digest:digest},context:{tokens},

            success:value => { digest = value.order_digest; },message:'Порядок збережено',
        });

        if (result.state !== 'saved' && result.state !== 'uncertain') {
            sortable.captureAnimationState();
            before.forEach(node => list.append(node));
            sortable.animateAll();
        }

        if (result.state !== 'uncertain') {
            sortable.option('disabled',false);
        }
    });

    return list;
}

async function saveForm(controller,publish) {
    if (mutations.pending || mutations.busy) {
        mutations.announcePending();

        return;
    }

    const fresh = !controller.record;
    const kind = controller.kind;
    const payload = controller.values();
    const expected = fresh ? null : {record_token:controller.record.record_token,content_version:controller.record.content_version};
    controller.operationId ||= crypto.randomUUID();
    const operationId = controller.operationId;
    controller.setBusy(true);

    try {
        if (kind === 'project') {
            if (controller.blob) {
                toast('Завантажуємо обкладинку…',{kind:'busy'});
                const uploaded = await client.upload(controller.blob,{
                    record_token:fresh ? operationId : controller.record.record_token,
                    base_cover_revision:fresh ? '0' : controller.record.cover_revision,purpose:fresh ? 'create' : 'replace',
                });

                if (fresh) {
                    payload.cover_ticket = uploaded.cover_ticket;
                } else {
                    payload.cover = {mode:'replace',ticket:uploaded.cover_ticket};
                }
            } else if (!fresh) {
                payload.cover = {mode:'keep'};
            }
        }

        if (fresh) {
            payload.base_slug = controller.form.querySelector('#slug').value;

            if (kind === 'project') {
                payload.published = publish;
            } else {
                payload.status = publish ? 'open' : 'draft';
            }
        }

        const result = await mutations.run({
            action:kind + (fresh ? '.create' : '.update'),payload,expected,operationId,
            context:{id:controller.record?.id,coverBefore:controller.record?.image_path},

            success:value => {
                controller.dirty = false;
                controller.savedRecord = value.record;
            },message:fresh && !publish ? 'Чернетку збережено' : 'Зміни збережено',
        });

        if (result.state === 'saved') {
            await navigate(kind + '-edit',result.record.id,{replace:true,focus:false,resetScroll:false,animate:false,record:result.record});
        } else if (result.state !== 'uncertain') {
            controller.setBusy(false);
        }
    } catch (error) {
        controller.setBusy(false);

        if ([401,403].includes(error.status)) {
            accessLost(error);
        } else {
            toast(error.message,{kind:'error'});
        }
    }
}

async function renderCurrent({focus = false,preserveScroll = true,animate = true,recordOverride} = {}) {
    const previousRow = document.activeElement.closest('.record-row');
    const previousRows = [...main.querySelectorAll('.record-row')];
    const previousIndex = previousRows.indexOf(previousRow);
    const previousRecord = previousRow?.dataset.record;
    const previousAction = document.activeElement.tagName === 'SUMMARY' ? 'summary' : 'button';
    const previousField = main.contains(document.activeElement) ? document.activeElement.id : '';
    const wasSave = document.activeElement.closest('.form-toolbar');
    const previousScroll = {left:scrollX,top:scrollY,behavior:'instant'};
    const version = ++viewVersion;
    const route = currentRoute();

    if (!authorized || route.view === 'login') {
        await loginView();

        return;
    }

    clearView();
    setHeader(true);
    const signal = viewAbort.signal;
    const image = createCoverImages(client,signal);
    const knownRoute = routes.has(route.view);
    const title = knownRoute ? pageTitle(route.view) : 'Редактор';

    if (knownRoute) {
        main.append(heading(title),resource('Завантажуємо ' + title.toLowerCase() + '…','',null,'',{loading:true}));
    }

    try {
        if (!routes.has(route.view)) {
            throw Object.assign(new Error('Сторінку не знайдено'),{status:404});
        }

        let content;

        if (route.view === 'briefs') {
            await briefs.render({ ...route, signal });
            if (signal.aborted || version !== viewVersion) {
                return;
            }
        } else if (['projects','vacancies'].includes(route.view)) {
            const kind = route.view === 'projects' ? 'project' : 'vacancy';
            content = await renderList(kind,image,signal);

            if (signal.aborted || version !== viewVersion) {
                return;
            }

            main.replaceChildren(heading(title,button(kind === 'project' ? 'Додати проєкт +' : 'Додати вакансію +',() => navigate(kind + '-new'),'primary-action')),content);
        } else if (route.view === 'collections') {
            const [collections,catalog] = await Promise.all([client.read('collections',{},signal),client.catalog('projects',signal)]);

            if (signal.aborted || version !== viewVersion) {
                return;
            }

            main.replaceChildren();

            renderCollections({main,collections,records:catalog.records,image,dialog:panel,save:async (collection,items,digest) => {
                return mutations.run({
                    action:'collection.replace',payload:{collection,items},expected:{collection_digest:digest},
                    context:{tokens:Object.fromEntries(catalog.records.map(record => [record.id,record.record_token]))},message:'Добірку збережено',
                });
            }});
        } else {
            const kind = route.view.startsWith('vacancy') ? 'vacancy' : 'project';
            const fresh = route.view.endsWith('-new');

            if (!fresh && !validId(route.id)) {
                throw Object.assign(new Error('Запис недоступний'),{status:404});
            }

            const record = fresh ? null : recordOverride?.id === route.id ? recordOverride : (await client.read(kind,{id:route.id},signal)).record;

            if (signal.aborted || version !== viewVersion) {
                return;
            }

            let draft;
            let changedWhileAway = false;

            if (suspended && suspended.actor === actor && suspended.route.view === route.view && suspended.route.id === route.id) {
                draft = suspended.draft;

                if (record && (record.record_token !== suspended.record?.record_token || record.content_version !== suspended.record?.content_version)) {
                    changedWhileAway = true;
                }
            }

            form = createContentForm({kind,record:draft ? suspended.record : record,image,onSave:saveForm,onBack:() => navigate(kind === 'project' ? 'projects' : 'vacancies'),draft});
            suspended = null;
            main.replaceChildren(form.heading,form.form);

            if (changedWhileAway) {
                form.form.before(notice('Запис змінився під час вашої відсутності','Перед наступним збереженням перегляньте актуальні дані','error',button('Оновити дані',() => navigate(route.view,route.id,{replace:true}))));
            }

            document.body.classList.add('editor-page--editing');
        }

        document.title = title + ' — MobileVision';
        main.dataset.ready = route.view;

        if (focus) {
            focusHeading();
        } else if (preserveScroll) {
            const rows = [...main.querySelectorAll('.record-row')];
            const row = rows.find(node => node.dataset.record === previousRecord) || (previousIndex >= 0 ? rows[Math.min(previousIndex,rows.length - 1)] : null);
            const target = row?.querySelector(previousAction)
                || (previousField ? document.getElementById(previousField) : null)
                || (wasSave ? main.querySelector('.form-toolbar button') : null);
            target?.focus({preventScroll:true});
            window.scrollTo(previousScroll);
        }

        if (animate) {
            motion(main,[{opacity:0,transform:'translateY(.5rem)'},{opacity:1,transform:'none'}]);
        }
    } catch (error) {
        if (!signal.aborted && version === viewVersion) {
            handleReadError(error);
        }
    }
}

function handleReadError(error) {
    if ([401,403].includes(error.status)) {
        accessLost(error);

        return;
    }

    const route = currentRoute();
    const knownRoute = routes.has(route.view);
    const destination = knownRoute && (route.view.startsWith('vacancy') || route.view === 'vacancies') ? 'vacancies' : 'projects';

    main.replaceChildren(heading(knownRoute ? pageTitle(route.view) : 'Редактор'),resource(
        error.status === 404 ? 'Сторінка недоступна' : 'Не вдалося завантажити дані',
        error.status === 404 ? 'Перевірте адресу або поверніться до списку' : 'Перевірте з’єднання та повторіть запит',
        error.status === 404 ? () => navigate(destination) : () => renderCurrent(),
        error.status === 404 ? 'До списку' : 'Спробувати ще раз',
    ));
}

async function accessLost(error) {
    clearToast();
    accessVersion += 1;
    viewVersion += 1;

    if (!loggingOut && form?.dirty && actor) {
        suspended = {actor,route:currentRoute(),record:form.record,draft:form.capture()};
    }

    setHeader(false);
    panel.setBusy(false);
    await panel.close();
    await menu.close();
    await loginView(error);
}

async function checkAccess({initial = false} = {}) {
    let session;
    const version = ++accessVersion;

    try {
        session = await client.session();

        if (version !== accessVersion || loggingOut) {
            return;
        }

        if (!session) {
            if (!initial && !authorized && main.querySelector('.login-form input[type="email"]')) {
                return;
            }

            if (initial || (!actor && !suspended && !mutations.pending)) {
                await loginView();
            } else {
                await accessLost({status:401});
            }

            return;
        }

        const access = await client.read('access');

        if (version !== accessVersion || loggingOut) {
            return;
        }

        const claims = JSON.parse(atob(access.mutation_permit.split('.')[0].replaceAll('-','+').replaceAll('_','/')));
        const nextActor = claims.actor;

        if (actor && actor !== nextActor) {
            suspended = null;
            mutations.clear();
        }

        const keepView = authorized && actor === nextActor;
        actor = nextActor;
        setHeader(true);

        if (keepView) {
            return;
        }

        if (currentRoute().view === 'login') {
            const target = new URL('editor.html',location.href);
            target.searchParams.set('view','projects');
            history.replaceState({editorIndex:historyIndex},'',target);
        }

        await renderCurrent({focus:keyboardActivation});

        if (mutations.pending) {
            form?.setBusy(true);
            mutations.announcePending();
        }
    } catch (error) {
        if (version !== accessVersion) {
            return;
        }

        if (error.status === 401 && !initial && !authorized && main.querySelector('.login-form input[type="email"]')) {
            return;
        }

        if ([401,403].includes(error.status)) {
            await accessLost({status:error.status,code:error.code,registered:Boolean(registeredUser && session?.user.id === registeredUser)});
        } else if (authorized) {
            toast('Не вдалося перевірити доступ. Перевірте з’єднання',{kind:'error',action:() => checkAccess()});
        } else {
            clearView();
            main.append(heading('Керування сайтом'),resource('Не вдалося перевірити доступ','Перевірте з’єднання та спробуйте ще раз',() => checkAccess()));
        }
    }
}

async function explicitLogout({confirm = true} = {}) {
    await menu.close();
    let permitted = true;

    if (confirm && mutations.pending) {
        permitted = await panel.confirm({
            heading:'Результат збереження не підтверджено',
            text:'Дія могла завершитися на сервері. Вийти з редактора?',
            label:'Вийти',

            execute:async () => true,
        });
    } else if (confirm) {
        permitted = await canLeave();
    }

    if (loggingOut || !permitted) {
        return;
    }

    loggingOut = true;
    registeredUser = undefined;
    accessVersion += 1;
    viewVersion += 1;
    clearToast();
    suspended = null;
    actor = null;
    mutations.clear();
    channel?.postMessage({event:'explicit-logout'});
    const target = new URL('editor.html',location.href);
    target.searchParams.set('view','login');
    history.replaceState({editorIndex:historyIndex},'',target);
    await loginView();
    const loginForm = main.querySelector('.login-form');

    for (const control of loginForm.querySelectorAll('input,button')) {
        control.disabled = true;
    }

    loginForm.querySelector('button[type="submit"]').textContent = 'Виходимо…';

    try {
        await client.signOutLocal();
    } catch {
        await loginView({code:'LOGOUT_UNCONFIRMED'});
    } finally {
        loggingOut = false;

        if (loginForm.isConnected) {
            for (const control of loginForm.querySelectorAll('input,button')) {
                control.disabled = false;
            }

            loginForm.querySelector('button[type="submit"]').textContent = 'Увійти';
        }
    }
}

async function boot() {
    document.addEventListener('click',event => {
        keyboardActivation = event.detail === 0;
    },true);

    client = createEditorClient();

    mutations = createMutationController(client,{
        onUncertain:(verify,message) => {
            if (currentRoute().view === 'briefs') {
                briefs.showUncertain(verify,message);
                return;
            }
            clearToast();

            if (!uncertainView) {
                uncertainView = document.createDocumentFragment();
                uncertainView.append(...main.childNodes);
            }

            const state = resource(
                'Не вдалося підтвердити результат',
                message || 'З’єднання перервалось. Перевірте, чи збереглися зміни, перш ніж повторювати дію',
                async () => {
                    const action = state.querySelector('button');
                    action.disabled = true;
                    action.textContent = 'Перевіряємо…';
                    await verify();

                    if (action.isConnected) {
                        action.disabled = false;
                        action.textContent = 'Перевірити результат';
                    }
                },'Перевірити результат',
            );
            main.replaceChildren(heading('Збереження'),state);
            main.dataset.ready = 'uncertain';

            if (keyboardActivation) {
                focusHeading();
            }
        },

        onAccessLost:accessLost,

        onSettled:async ({conflict = false,result} = {}) => {
            if (currentRoute().view === 'briefs' && result?.result === 'deleted' && !conflict) {
                await navigate('briefs',null,{replace:true,filter:currentRoute().filter});
                toast('Звернення видалено');
                return;
            }
            if (uncertainView) {
                main.replaceChildren(uncertainView);
                uncertainView = null;
                main.dataset.ready = currentRoute().view;
            }

            if (form) {
                if (result?.record && !conflict) {
                    form.dirty = false;
                    await navigate(form.kind + '-edit',result.record.id,{replace:true,focus:false,resetScroll:false,animate:false,record:result.record});
                } else {
                    form.setBusy(false);
                    form.operationId = crypto.randomUUID();
                    toast('Поточні дані відрізняються. Перегляньте їх перед збереженням',{kind:'error',label:'Оновити дані',action:() => navigate(currentRoute().view,currentRoute().id,{replace:true})});
                }
            } else {
                await renderCurrent({focus:false});
            }
        },

        onConflict:() => navigate(currentRoute().view,currentRoute().id,{replace:true}),
    });

    briefs = createBriefsController({ client, main, dialog:panel, navigate, mutations, onAccessLost:accessLost, setSearchQuery:setBriefSearch });

    client.auth.onAuthStateChange(event => {
        queueMicrotask(() => {
            if (loggingOut || signingIn || event === 'INITIAL_SESSION') {
                return;
            }

            if (['SIGNED_OUT','SIGNED_IN','TOKEN_REFRESHED','USER_UPDATED'].includes(event)) {
                checkAccess();
            }
        });
    });

    channel?.addEventListener('message',event => {
        if (event.data?.event === 'explicit-logout' && !signingIn) {
            suspended = null;

            if (form) {
                form.dirty = false;
            }

            mutations.clear();
            client.auth.stopAutoRefresh();
            actor = null;
            accessLost();
        }
    });

    window.addEventListener('storage',event => {
        if (event.key === editorSessionKey && !loggingOut) {
            checkAccess();
        }
    });

    document.addEventListener('visibilitychange',() => {
        if (document.visibilityState === 'visible' && !signingIn && !loggingOut) {
            checkAccess();
        }
    });

    document.addEventListener('editor-access-lost',event => accessLost(event.detail));

    document.querySelectorAll('[data-signout]').forEach(node => {
        node.addEventListener('click',() => explicitLogout());
    });

    menuTrigger.addEventListener('click',() => {
        if (menu.open(menuTrigger)) {
            motion(menuNode,[{opacity:0},{opacity:1}]);
        }
    });

    document.addEventListener('click',async event => {
        const link = event.target.closest('a');

        if (!link || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || link.target === '_blank' || event.defaultPrevented) {
            return;
        }

        const target = new URL(link.href);

        if (target.origin === location.origin && target.pathname === location.pathname) {
            event.preventDefault();
            await menu.close();
            await navigate(target.searchParams.get('view') || 'projects',target.searchParams.get('id'));
        } else if (form?.dirty || mutations.pending || mutations.busy) {
            event.preventDefault();
            await menu.close();

            if (await canLeave()) {
                location.assign(target.href);
            }
        }
    });

    const positionOpenMenus = () => {
        document.querySelectorAll('.record-menu[open]').forEach(positionRecordMenu);
    };

    window.addEventListener('resize',positionOpenMenus);
    document.fonts?.addEventListener('loadingdone',positionOpenMenus);

    for (const event of ['pointerdown','focusin']) {
        document.addEventListener(event,item => {
            document.querySelectorAll('.record-menu[open]').forEach(menu => {
                if (!menu.contains(item.target)) {
                    menu.open = false;
                }
            });
        });
    }

    document.addEventListener('keydown',event => {
        if (event.key === 'Escape') {
            const opened = document.querySelector('.record-menu[open]');

            if (opened) {
                opened.open = false;
                opened.querySelector('summary').focus();
            }
        }
    });

    window.addEventListener('beforeunload',event => {
        if (form?.dirty || mutations.pending || mutations.busy) {
            event.preventDefault();
            event.returnValue = '';
        }
    });

    history.replaceState({...history.state,editorIndex:historyIndex},'',location.href);

    window.addEventListener('popstate',async event => {
        if (restoringHistory) {
            restoringHistory = false;

            return;
        }

        const next = event.state?.editorIndex || 0;
        const delta = next - historyIndex;

        if (delta && (form?.dirty || mutations.pending || mutations.busy)) {
            restoringHistory = true;
            history.go(-delta);

            if (await canLeave()) {
                history.go(delta);
            }

            return;
        }

        historyIndex = next;

        if (authorized) {
            await renderCurrent();
        } else if (!signingIn && !loggingOut) {
            await checkAccess({initial:true});
        }
    });

    window.addEventListener('scroll',() => {
        header.classList.toggle('main-header--scrolled',scrollY > 20);
    },{passive:true});

    await checkAccess({initial:true});
}

boot().catch(() => {
    clearView();
    setHeader(false);
    main.append(heading('Керування сайтом'),resource('Редактор поки недоступний','Спробуйте відкрити сторінку ще раз',() => location.reload(),'Оновити сторінку'));
});

