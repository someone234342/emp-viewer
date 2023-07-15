// ==UserScript==
// @name         EMPViewer
// @namespace    https://www.empornium.sx/*
// @version      2.1
// @description  Better porn browsing
// @author       someone234342
// @match        https://www.empornium.sx/*
// @icon         https://www.empornium.sx/favicon.ico
// @require      https://cdnjs.cloudflare.com/ajax/libs/preact/10.16.0/preact.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/htm/3.1.1/htm.js
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    const html = htm.bind(preact.h);

    const userSettings_saved = localStorage.getItem('EMPViewer_settings');
    let userSettings = {
        minimal: false,
        cols: '3',

        // list of tags separated by space
        tags_like: '',
        tags_dislike: '',
        cats_like: '',
        cats_dislike: '',

        preserve_tags: false,

        hide_disliked: false,
    };
    
    if (userSettings_saved) {
        try {
            userSettings = JSON.parse(userSettings_saved)
        } catch(e) {
            logError(e);
        }
    }

    // define new ones for different table layouts
    // index starts from 1 (CSS nth-child selector)
    let cellidx = {
        'category': 1,
        'main': 2,
        'icons': 2,
        'time': 5,
        'size': 6,
        'snatches': 7,
        'seeders': 8,
        'leechers': 9,
        'uploader': 10
    }

    if (location.pathname === '/collages.php') {
        cellidx = {
            'category': 1,
            'main': 2,
            'icons': 3,
            'time': 4,
            'size': 5,
            'snatches': 6,
            'seeders': 7,
            'leechers': 8
        }
    }

    if (location.pathname === '/top10.php') {
        cellidx = {
            'category': 2,
            'main': 3,
            'icons': 3,
            'time': 0,
            'size': 5,
            'snatches': 6,
            'seeders': 7,
            'leechers': 8,
            'uploader': 9
        }
    }

    const selectors = {
        /** @type {(row: HTMLTableRowElement) => Torrent['id']} */
        id: selectorFn(row => {
            const torrentLink = row.querySelector('a[href*="/torrents.php?id="]');
            const re = /torrents\.php\?id=([\d]+)/;
            const match = torrentLink.href.match(re);

            return match[1];
        }),

        /** @type {(row: HTMLTableRowElement) => Torrent['title']} */
        title: selectorFn(row => {
            const torrentLink = row.querySelector('a[href*="/torrents.php?id="]');
            return torrentLink.innerHTML;
        }),

        /** @type {(row: HTMLTableRowElement) => Torrent['uploader']} */
        uploader: selectorFn(row => {
            const link = row.querySelector(`td:nth-child(${cellidx.uploader}) a`);

            return {
                url: link.href,
                id: link.innerHTML   
            }
        }),

        /** @type {(row: HTMLTableRowElement) => Torrent['category']} */
        category: selectorFn(row => {
            const img = row.querySelector(`td:nth-child(${cellidx.category}) img`);

            return {
                url: img.parentNode.href,
                id: img.parentNode.title || img.parentNode.parentNode.title   
            }
        }),
        
        /** @type {(row: HTMLTableRowElement) => Torrent['tags']} */
        tags: selectorFn(row => {
            const tagNodes = row.querySelectorAll(`td:nth-child(${cellidx.main}) .tags a`);
            const tags = [];
            
            for (const node of tagNodes) {
                tags.push(node.innerHTML);
            }

            const tagsNode = row.querySelector(`td:nth-child(${cellidx.main}) .tags`);
            
            return {
                tags,
                tagsMarkup: tagsNode.innerHTML
            };
        }),
        
        /** @type {(row: HTMLTableRowElement) => Torrent['icons']} */
        icons: selectorFn(row => {
            return row.querySelector(`td:nth-child(${cellidx.icons}) .torrent_icon_container`).innerHTML;
        }),

        /** @type {(row: HTMLTableRowElement) => Torrent['cover']} */
        cover: selectorFn(row => {
            const coverScript = row.querySelector(`td:nth-child(${cellidx.main}) script`).innerHTML;
            const re = /src=\\"([^"]+)/i;
            const match = coverScript.match(re);

            return match[1];
        }),

        /** @type {(row: HTMLTableRowElement) => Torrent['time']} */
        time: selectorFn(row => {
            const timeTag = row.querySelector(`td:nth-child(${cellidx.time}) .time`);
            
            return {
                relative: timeTag.innerHTML,
                absolute: timeTag.title
            }
        }),

        /** @type {(row: HTMLTableRowElement) => Torrent['seeders']} */
        seeders: selectorFn(row => {
            return Number(row.querySelector(`td:nth-child(${cellidx.seeders})`).innerHTML);
        }),

        /** @type {(row: HTMLTableRowElement) => Torrent['leechers']} */
        leechers: selectorFn(row => {
            return Number(row.querySelector(`td:nth-child(${cellidx.leechers})`).innerHTML);
        }),

        /** @type {(row: HTMLTableRowElement) => Torrent['size']} */
        size: selectorFn(row => {
            return row.querySelector(`td:nth-child(${cellidx.size})`).innerHTML;
        }),
    };

    // in case something goes wrong with a selector
    function selectorFn(fn) {
        return (row) => {
            try {
                return fn(row);
            } catch(e) {
                logError(e);
                return undefined
            }
        }
    }

    /**
     * @typedef {{ 
     *     id: string; 
     *     title: string; 
     *     cover: string;
     *     uploader: { url: string; id: string }; 
     *     category: { url: string; id: string }; 
     *     tags: {
     *         tags: string[];
     *         tagsMarkup: string;
     *     }; 
     *     icons: any[]; 
     *     files: number; 
     *     comments: number; 
     *     time: { relative: string; absolute: string }; 
     *     size: string; 
     *     snatches: number; 
     *     seeders: number; 
     *     leeachers: number;
     * }} Torrent
     */
    
    /** @type {(table: HTMLTableElement) => Torrent[]}  */
    function getTorrents(table) {
        /** @type {NodeListOf<HTMLTableRowElement>} */
        const rows = table.querySelectorAll('tr.torrent');

        /** @type {Torrent[]} */
        const torrents = [];

        for (const row of rows) {
            const torrent = {};
            for (const selector in selectors) {
                torrent[selector] = selectors[selector](row)
            }

            torrents.push(torrent);
        }

        return torrents;
    }

    class ContentPrefs extends preact.Component {
        state = this.props.initialState

        save = (e) => {
            e.preventDefault();

            // crude update
            for (const key in this.state) {
                if (key !== 'minimal' && key !== 'cols') {
                    this.props.updateState(key, this.state[key]);
                }
            }

            const dialog = document.getElementById('contentPrefsDialog');
            dialog.close();
        }

        render() {
            return html`
                <form onSubmit=${this.save}>
                    <p class="colhead prefs_notice">
                        Recommended: Use <a href="https://www.empornium.sx/forum/thread/78406">Tag highlighter userscript</a> for a more powerful preference system. Enable "Preserve tags" setting once installed
                    </p>

                    <fieldset>
                        <strong>Tags you like</strong>
                        <textarea onChange=${(e) => this.setState(prev => ({
                            ...prev,
                            tags_like: e.target.value
                        }))} value=${this.state.tags_like} class="inputtext" />
                    </fieldset>
                    
                    <fieldset>
                        <strong>Tags you dislike</strong>
                        <textarea onChange=${(e) => this.setState(prev => ({
                            ...prev,
                            tags_dislike: e.target.value
                        }))} value=${this.state.tags_dislike} class="inputtext" />
                    </fieldset>
                    
                    <fieldset>
                        <strong>Categories you like</strong>
                        <textarea onChange=${(e) => this.setState(prev => ({
                            ...prev,
                            cats_like: e.target.value
                        }))} value=${this.state.cats_like} class="inputtext" />
                    </fieldset>
                    
                    <fieldset>
                        <strong>Categories you dislike</strong>
                        <textarea onChange=${(e) => this.setState(prev => ({
                            ...prev,
                            cats_dislike: e.target.value
                        }))} value=${this.state.cats_dislike} class="inputtext" />
                    </fieldset>

                    <fieldset style="display:flex;flex-direction:row">
                        <input onChange=${(e) => this.setState(prev => ({
                            ...prev,
                            hide_disliked: e.target.checked
                        }))} checked=${this.state.hide_disliked} type="checkbox" id="hide_disliked" />
                        <label for="hide_disliked">Completely hide disliked content</label>
                    </fieldset>
                
                    <div>
                        <button onClick=${() => {
                            const dialog = document.getElementById('contentPrefsDialog');
                            dialog.close();
                        }}>Cancel</button>
                        <button type="submit">Save</button>
                    </div>
                </form>
            `;
        }
    }

    /**
     * Components
     */
    class View extends preact.Component {
        state = { ...userSettings }

        updateState = (key, val) => {
            this.setState(prev => {
                const newState = { ...prev, [key]: val };

                localStorage.setItem('EMPViewer_settings', JSON.stringify(newState))

                return newState;
            })
        }

        render() {
            /** @type {Torrent[]} */
            const torrents = this.props.torrents;

            log({ torrents })

            return html`
                <div class="view-controls ${this.state.preserve_tags ? 'preserved-tags': ''}">
                    <div>
                        <input checked=${this.state.minimal} onChange=${(e) => this.updateState('minimal', e.target.checked)} type="checkbox" id="view-minimal" />
                        <label for="view-minimal"> Minimal</label>
                    </div>

                    <div>
                        <input checked=${this.state.preserve_tags} onChange=${(e) => this.updateState('preserve_tags', e.target.checked)} type="checkbox" id="view-preserve_tags" />
                        <label for="view-preserve_tags"> Preserve Tags</label>
                    </div>

                    <div>
                        <input value=${this.state.cols} onChange=${(e) => this.updateState('cols', e.target.value)} type="number" min="0" max="10" id="view-cols" />
                        <label for="view-cols">Columns</label>
                    </div>

                    <button 
                        onClick=${()=> {
                            const dialog = document.getElementById('contentPrefsDialog');
                            dialog.showModal();
                        }}
                    >
                        Edit content preferences
                    </button>

                    <dialog id="contentPrefsDialog">
                        <${ContentPrefs} initialState=${this.state} updateState=${this.updateState} />
                    </dialog>
                </div>

                <div class="grid ${this.state.minimal && 'minimal'}">
                    ${torrents.map(t => html`<${TorrentCard} ...${{ torrent: t, prefs: this.state }} />`)}
                </div>
                <style>
                    .grid {
                        padding: 10px;
                        display: grid;
                        grid-template-columns: repeat(${this.state.cols}, 1fr);
                        gap: 10px;
                    }
                </style>
            `
        }
    }

    /** @type {(props: { torrent: Torrent, prefs: typeof userSettings }) => any}  */
    function TorrentCard(props) {
        const torrent = props.torrent;
        const likedTags = props.prefs.tags_like.split(" ");

        const disliked = isDisliked(torrent, props.prefs);
        const likedTag = isLikedTag(torrent, props.prefs);
        const likedCat = isLikedCat(torrent, props.prefs);

        if (disliked && props.prefs.hide_disliked) return null;

        return html`
            <div class="torrent empviewer_card ${(likedTag || likedCat) && 'liked'} ${disliked && 'disliked'}">
                <div class="card_meta">
                    <div class="card_dl_info">
                        <strong>${torrent.size}</strong>
                        <span>↑${torrent.seeders}</span>
                        <span>↓${torrent.leechers}</span>
                    </div>
                    
                    <div class="card_icons" dangerouslySetInnerHTML=${{ __html: torrent.icons }} />
                </div>

                <div class="card_inner">
                    <a class="card_cover" href="https://www.empornium.sx/torrents.php?id=${torrent.id}">
                        <img src="${torrent.cover}" />
                    </a>

                    <div class="card_details">
                        <a href="https://www.empornium.sx/torrents.php?id=${torrent.id}">
                            ${torrent.title}
                        </a>
                    </div>
                </div>
                <div class="card_title">
                    ${torrent.category && html`<a class="card_category" href=${torrent.category?.url}>${torrent.category?.id}</a>`}
                    <a href="https://www.empornium.sx/torrents.php?id=${torrent.id}">
                        ${torrent.title}
                    </a> 
                </div>

                <${Tags} ...${{ prefs: props.prefs, torrent: props.torrent }} />
            </div>
        `
    }

    /** @type {(props: { torrent: Torrent, prefs: typeof userSettings }) => any}  */
    function Tags(props) {
        const likedTags = props.prefs.tags_like.split(" ");
        const disliked = isDisliked(props.torrent, props.prefs);
        const likedTag = isLikedTag(props.torrent, props.prefs);
        const likedCat = isLikedCat(props.torrent, props.prefs);

        if (userSettings.preserve_tags) {
            return html`<div class="tags" dangerouslySetInnerHTML=${{ __html: props.torrent.tags.tagsMarkup }} />`
        }

        if (likedTag) {
            return html`
                <div class="card_tags">
                    ${likedTags.map(t => html`<a href=${`https://www.empornium.sx/torrents.php?taglist=${t}`}>${t}</a>`)}
                </div>
            `;
        }
    }

    /** @type {(t: Torrent, prefs: typeof userSettings) => boolean} */
    function isDisliked(torrent, prefs) {
        const dislikedCats = prefs.cats_dislike.split(' ');
        if (dislikedCats.includes(torrent.category?.id)) return true;

        const dislikedTags = prefs.tags_dislike.split(' ');
        for (const tag of dislikedTags) {
            if (torrent.tags.tags.indexOf(tag) > -1) return true;    
        }
        
        return false;
    }

    /** @type {(t: Torrent, prefs: typeof userSettings) => boolean} */
    function isLikedTag(torrent, prefs) {
        const likedTags = prefs.tags_like.split(' ');

        for (const tag of likedTags) {
            if (torrent.tags.tags.includes(tag)) return true;
        }
        
        return false;
    }

    /** @type {(t: Torrent, prefs: typeof userSettings) => boolean} */
    function isLikedCat(torrent, prefs) {
        const likedCats = prefs.cats_like.split(' ');

        return likedCats.includes(torrent.category?.id);
    }

    /** Render */
    
    const torrentTables = document.querySelectorAll('.torrent_table, #torrent_table');
    
    torrentTables.forEach(torrentTable => {
        if (torrentTable) {
            const torrents = getTorrents(torrentTable);

            insertCSS();
            const container = document.createElement('div');
            container.className = 'view-container';
            torrentTable.parentNode.insertBefore(container, torrentTable.nextSibling);
            
            preact.render(preact.h(View, {
                torrents,
            }), container)

            // torrentTable.remove();
            const toRemove = torrentTable.querySelectorAll('tr:not(.colhead):not(.head)');
            for (const e of toRemove) {
                e.remove();
            }
        } else {
            log('Torrent Table not found.');
        }
    })

    /** styling */
    function insertCSS() {
        const tag = document.createElement('style');
        tag.type = 'text/css';
        tag.innerHTML = `
            .view-container {
                background: #70839b;
            }

            .view-controls {
                background: #c6def6;
                display: flex;
                flex-direction: row;
                align-items: center;
                gap: 15px;
                padding: 10px;
            }

            .view-controls button {
                padding: 2px 4px;
            }

            .empviewer_card {
                display: flex;
                overflow: hidden;
                background: #222;
                border-radius: 10px;
                flex-direction: column;
                color: #ddd;
            }

            .card_inner {
                display: flex;
                overflow: hidden;
                position: relative;
            }

            .empviewer_card a:link {
                color: #8ba7e9;
            }
            .empviewer_card a:hover {
                text-decoration: underline;
            }

            .empviewer_card .tags {
                padding: 10px;
            }
            
            .empviewer_card a:visited {
                color: #a583a9;
                opacity: 0.8;
            }

            .card_cover {
                width: 100%;
            }

            .card_cover img {
                width: 100%;
                height: 100%;
                object-fit: contain;
                background-color: black;
            }

            .disliked .card_cover img {
                filter: blur(20px);
            }

            .liked {
                outline: 3px solid orange;
            }
            .empviewer_card:has(.s-loved) {

                outline: 3px solid #3D9949;
            }

            .disliked.hide-disliked .card_cover img {
                display: none;
            }

            .grid .card_cover {
                aspect-ratio: 4/3;
            }

            .card_details {
                display: none;
                position: absolute;
                bottom: 0;
                right: 0;
                background: hsl(0deg 0% 0% / 79%);
                color: white;
                padding: 10px;
                left: 0;
                transform: translateY(100%);
                transition: 150ms ease;
            }

            .empviewer_card:hover .card_details {
                transform: none;
            }

            .card_meta {
                padding: 10px;
                display: flex;
                flex-direction: row;
                justify-content: space-between;
            }

            .card_dl_info {
                display: flex;
                flex-direction: row;
                align-items: center;
                gap: 4px;
            }

            .card_dl_info span {
                font-size: 12px;
                color: #aaa;
            }

            .card_title {
                padding: 10px;
                line-height: 1.5;
                font-size: 1.2em;
            }

            .card_category {
                background: #aaa;
                color: black !important;
                margin-right: 5px;
                padding: 1px 2px;
                font-size: 90%;
                font-weight: bold;
                border-radius: 3px;
            }

            /* Minimal */
            .minimal .card_meta,
            .minimal .card_title
            { display: none }

            #contentPrefsDialog {
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                min-width: 300px;
            }

            #contentPrefsDialog form {
                padding: 15px;
                display: flex;
                flex-direction: column;
                gap: 10px;
            }

            #contentPrefsDialog::backdrop {
                background: rgba(0,0,0,0.5);
            }
            #contentPrefsDialog fieldset {
                display: flex;
                flex-direction: column;
                border: 0;
                gap: 3px;
            }

            .card_tags {
                padding: 0 10px 10px;
            }

            .card_tags a {
                border: 1px solid #aaa;
                margin-right: 5px;
                padding: 1px 2px;
                border-radius: 3px;
            }

            #content {
                max-width: none;
                width: 95%;
            }

            /* darken tag-highlighter blacklisted notice */
            .view-container .tr11 {
                background: #111;
                color: #ccc;
            }

            .view-container .s-percent-container {
                background: #000;
                border: 0;
                width: 100% !important;
            }

            .prefs_notice {
                padding: 5px;
            }

            .prefs_notice a { text-decoration: underline }
        `
        document.head.appendChild(tag)
    }

    /** helpers */
    function log(str) {
        console.log(`[EmpViewer] ${str}`);
    }
    
    function logError(e) {
        console.error('[EmpViewer]', e);
    }
})();
