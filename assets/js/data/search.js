const order = new Intl.Collator('uk', { sensitivity: 'base', numeric: true });
const sorts = new Set(['studio', 'name-asc', 'name-desc']);

function limitText(value, maximum) {
    return Array.from(value || '').slice(0, maximum).join('');
}

export function searchQuery(value, maximum = 160) {
    return limitText((value || '').normalize('NFC').replace(/\s+/gu, ' ').trim(), maximum);
}

export function matchesSearch(values, query) {
    const needle = searchQuery(query).toLocaleLowerCase('uk');

    return !needle || values.some(value => searchQuery(value, Infinity).toLocaleLowerCase('uk').includes(needle));
}

export function catalogParameters(parameters) {
    const sort = parameters.get('sort');

    return {
        query: searchQuery(parameters.get('q')),
        category: limitText(parameters.get('category'), 160),
        sort: sorts.has(sort) ? sort : 'studio',
    };
}

export function selectProjects(records, { query, category, sort }) {
    const result = records.filter(record => (!category || record.category === category) && matchesSearch([record.name, record.description], query));

    if (sort !== 'studio') {
        result.sort((a, b) => {
            const names = order.compare(a.name, b.name);

            return names ? (sort === 'name-desc' ? -names : names) : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
        });
    }

    return result;
}
