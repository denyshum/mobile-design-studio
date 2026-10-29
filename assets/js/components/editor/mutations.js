import { toast } from './controls.js';
import { verifyMutation } from './verification.js';

export function createMutationController(client,{onAccessLost,onSettled,onConflict,onUncertain}) {
    let busy = false;
    let pending;

    function announcePending() {
        if (onUncertain) {
            onUncertain(verify);

            return;
        }

        toast('Не вдалося підтвердити результат. Перевірте збереження перед наступною дією', {
            kind:'error',label:'Перевірити результат',action:verify,
        });
    }

    async function verify() {
        if (!pending || busy) {
            return;
        }

        busy = true;
        toast('Перевіряємо збереження…',{kind:'busy'});

        try {
            const actual = await verifyMutation(client,pending);

            if (actual.matches) {
                const completed = pending;
                pending = null;
                busy = false;
                completed.success?.(actual.result);
                toast('Поточні дані відповідають змінам');
                await onSettled?.({result:actual.result,operation:completed});
            } else if (actual.settled) {
                pending = null;
                busy = false;
                toast('Результат перевірено. Дані відрізняються — перегляньте їх перед наступним збереженням',{kind:'error'});
                await onSettled?.({conflict:true});
            } else {
                if (onUncertain) {
                    onUncertain(verify,'Операція ще може завершуватися. Перевірте результат трохи згодом');
                } else {
                    toast('Операція ще може завершуватися. Перевірте результат трохи згодом',{
                        kind:'error',label:'Перевірити результат',action:verify,
                    });
                }
            }
        } catch (error) {
            if ([401,403].includes(error.status)) {
                onAccessLost(error);
            } else {
                announcePending();
            }
        } finally {
            busy = false;
        }
    }

    async function run({action,payload,expected = null,operationId = crypto.randomUUID(),context,success,message = 'Зміни збережено'}) {
        if (busy || pending) {
            if (pending) {
                announcePending();
            } else {
                toast('Зачекайте завершення поточної дії',{kind:'busy'});
            }

            return {state:pending ? 'uncertain' : 'blocked'};
        }

        busy = true;
        toast('Зберігаємо…',{kind:'busy'});
        let sent;

        try {
            const result = await client.mutate(action,payload,expected,{operationId,onSent:meta => { sent = meta; }});
            success?.(result);
            toast(message);

            return {state:'saved',...result};
        } catch (error) {
            if (error.committed === null && sent) {
                pending = {action,payload,expected,operationId,context,success,...sent};
                announcePending();

                return {state:'uncertain'};
            }

            if ([401,403].includes(error.status)) {
                onAccessLost(error);
            } else {
                toast(error.message,{kind:'error',...(error.status === 409 && onConflict ? {label:'Оновити дані',action:onConflict} : {})});
            }

            return {state:'rolled-back',error};
        } finally {
            busy = false;
        }
    }

    return {
        run,verify,

        get pending() { return Boolean(pending); },

        get busy() { return busy; },

        clear() { pending = null; },

        announcePending,
    };
}

