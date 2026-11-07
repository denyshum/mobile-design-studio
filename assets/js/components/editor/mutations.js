import { toast } from './controls.js';
import { verifyMutation } from './verification.js';

export function createMutationController(client,{onAccessLost,onSettled,onConflict,onUncertain}) {
    let busy = false;
    let pending;
    let generation = 0;

    function announcePending() {
        if (!pending) {
            if (busy) {
                toast('Зачекайте завершення поточної дії',{kind:'busy'});
            }
            return;
        }
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
        const operation = pending;
        const version = ++generation;
        busy = true;
        toast('Перевіряємо збереження…',{kind:'busy'});

        try {
            const actual = await verifyMutation(client,operation);
            if (version !== generation || pending !== operation) {
                return;
            }
            if (actual.matches) {
                pending = null;
                busy = false;
                operation.success?.(actual.result);
                const feedback = await onSettled?.({result:actual.result,operation});
                if (version === generation && feedback !== false) {
                    toast(feedback?.message || 'Поточні дані відповідають змінам',feedback?.options);
                }
            } else if (actual.settled) {
                pending = null;
                busy = false;
                const feedback = await onSettled?.({conflict:true,operation});
                if (version === generation && feedback !== false) {
                    toast(feedback?.message || 'Результат перевірено. Дані відрізняються — перегляньте їх перед наступним збереженням',{kind:'error',...feedback?.options});
                }
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
            if (version !== generation) {
                return;
            }
            if ([401,403].includes(error.status)) {
                await onAccessLost(error);
            } else if (pending === operation) {
                announcePending();
            } else {
                toast('Результат перевірено, але сторінку не вдалося оновити',{
                    kind:'error',...(onConflict ? {label:'Оновити дані',action:onConflict} : {}),
                });
            }
        } finally {
            if (version === generation) {
                busy = false;
            }
        }
    }

    async function run({action,payload,expected = null,operationId = crypto.randomUUID(),context,success,message = 'Зміни збережено',quietBusy = false}) {
        if (busy || pending) {
            if (pending) {
                announcePending();
            } else {
                toast('Зачекайте завершення поточної дії',{kind:'busy'});
            }
            return {state:pending ? 'uncertain' : 'blocked'};
        }
        const version = ++generation;
        busy = true;
        if (!quietBusy) {
            toast('Зберігаємо…',{kind:'busy'});
        }
        let sent;

        try {
            const result = await client.mutate(action,payload,expected,{operationId,onSent:meta => { sent = meta; }});
            if (version !== generation) {
                return {state:'cancelled'};
            }
            success?.(result);
            if (message) {
                toast(message);
            }
            return {state:'saved',...result};
        } catch (error) {
            if (version !== generation) {
                return {state:'cancelled'};
            }
            if (error.committed === null && sent) {
                pending = {action,payload,expected,operationId,context,success,...sent};
                announcePending();
                return {state:'uncertain'};
            }
            if ([401,403].includes(error.status)) {
                await onAccessLost(error);
            } else {
                toast(error.message,{kind:'error',...(error.status === 409 && onConflict ? {label:'Оновити дані',action:onConflict} : {})});
            }
            return {state:'rolled-back',error};
        } finally {
            if (version === generation) {
                busy = false;
            }
        }
    }

    return {
        run,verify,
        get pending() { return Boolean(pending); },
        get busy() { return busy; },
        clear() { generation += 1; pending = null; busy = false; },
        announcePending,
    };
}
