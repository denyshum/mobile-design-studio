export function sitePath(relative) {
    return (document.documentElement.dataset.siteRoot || '') + relative;
}
