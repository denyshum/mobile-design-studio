export function slugBase(value, kind) {
    const letters = { а: 'a', б: 'b', в: 'v', г: 'h', ґ: 'g', д: 'd', е: 'e', є: 'ie', ж: 'zh', з: 'z', и: 'y', і: 'i', ї: 'i', й: 'i', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ь: '', ю: 'iu', я: 'ia' };
    const result = [...String(value).toLowerCase()].map(character => letters[character] ?? character).join('')
        .replace(/№/g, '-').normalize('NFKD').toLowerCase().replace(/[\u0300-\u036f]/g, '').replace(/['’ʼ]/g, '')
        .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80).replace(/-+$/g, '');

    return result || (kind === 'project' ? 'project' : 'vacancy');
}



