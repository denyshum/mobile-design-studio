export function plural(count, [one, few, many]) {
    if (count % 10 === 1 && count % 100 !== 11) {
        return one;
    }
    if (count % 10 >= 2 && count % 10 <= 4 && (count % 100 < 12 || count % 100 > 14)) {
        return few;
    }
    return many;
}
