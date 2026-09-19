// A single top-layer popout opened from the audio menu or keyboard shortcut.
// Inherit Discord theme tokens, with defaults for unavailable tokens.
export const styles = `#local-volumes-root{font-family:var(--font-primary,system-ui,sans-serif);font-size:14px;color:var(--text-default,var(--text-normal,#e7e7ec));--lv-bg:var(--background-surface-high,var(--background-floating,#242429));--lv-input:var(--background-surface-higher,var(--background-secondary,#303037));--lv-muted:var(--text-muted,#aaaab5);--lv-border:var(--border-subtle,#45454f);--lv-accent:var(--brand-500,#5865f2);--lv-hover:var(--background-modifier-hover,#393940)}
#local-volumes-root *{box-sizing:border-box}
#local-volumes-root button,#local-volumes-root input{font:inherit}
#local-volumes-root button{cursor:pointer;white-space:nowrap;border:0;background:transparent;color:inherit;border-radius:6px;padding:7px 10px;line-height:20px}
#local-volumes-root button:not(:disabled):hover{background:var(--lv-hover)}
#local-volumes-root button:not(:disabled):active{background:var(--lv-hover)}
#local-volumes-root button:focus-visible,#local-volumes-root input:focus-visible{outline:2px solid var(--focus-primary,#00a8fc);outline-offset:3px}
#local-volumes-root button:disabled{opacity:.45;cursor:not-allowed}
#local-volumes-root h1,#local-volumes-root h2,#local-volumes-root p{margin:0}
#local-volumes-root h1{font-size:17px;line-height:24px;font-weight:700}
#local-volumes-root h2{font-size:14px;font-weight:650}
#local-volumes-root small,#local-volumes-root .muted{color:var(--lv-muted);font-size:12px;line-height:18px}
#local-volumes-root .grow{flex:1;min-width:0}
#local-volumes-root .row{display:flex;align-items:center;gap:10px}
#local-volumes-root .stack{display:grid;gap:4px}
#local-volumes-root .truncate{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#local-volumes-root .panel{position:fixed;inset:auto auto 74px 90px;margin:0;width:min(400px,calc(100vw - 24px));max-height:min(660px,calc(100dvh - 100px));overflow:hidden;padding:0;border:1px solid var(--lv-border);border-radius:12px;background:var(--lv-bg);color:inherit;box-shadow:0 12px 48px #0005;display:none}
#local-volumes-root .panel:popover-open{display:flex;flex-direction:column}
#local-volumes-root .panel::backdrop{background:transparent}
#local-volumes-root .header{padding:18px 18px 12px}
#local-volumes-root .header small{display:block;margin-top:2px}
#local-volumes-root .close{display:grid;place-items:center;flex:0 0 32px;width:32px;height:32px;font-size:23px;font-weight:300;padding:0}
#local-volumes-root .tabs{display:flex;padding:4px 12px 8px;gap:4px;border-bottom:1px solid var(--lv-border)}
#local-volumes-root .tab{border-radius:6px;padding:6px 12px;min-height:32px;color:var(--lv-muted);font-weight:600}
#local-volumes-root .tab[aria-selected=true]{color:inherit;background:var(--lv-input)}
#local-volumes-root .body{overflow:auto;overflow-x:hidden;scrollbar-width:thin;scrollbar-color:var(--lv-border) transparent;scrollbar-gutter:stable;overscroll-behavior:contain;padding:0 18px;min-height:130px}
#local-volumes-root .body::-webkit-scrollbar{width:6px}
#local-volumes-root .body::-webkit-scrollbar-track{background:transparent}
#local-volumes-root .body::-webkit-scrollbar-thumb{background:var(--lv-border);border-radius:999px}
#local-volumes-root .body::-webkit-scrollbar-thumb:hover{background:var(--lv-muted)}
#local-volumes-root .group{padding:18px 0}
#local-volumes-root .group+.group{border-top:1px solid var(--lv-border)}
#local-volumes-root .name{max-width:100%;min-height:32px;font-weight:650;padding:6px 8px;margin-left:-8px;text-align:left;overflow:hidden;text-overflow:ellipsis}
#local-volumes-root .group-content[hidden]{display:none}
#local-volumes-root .disclosure::before{content:"";display:inline-block;width:6px;height:6px;border-right:1.5px solid currentColor;border-bottom:1.5px solid currentColor;transform:translateY(-2px) rotate(45deg);margin:0 10px 0 2px}
#local-volumes-root .disclosure[aria-expanded=false]::before{transform:translateY(-1px) rotate(-45deg)}
#local-volumes-root .value{font-variant-numeric:tabular-nums;font-weight:650;min-width:54px;text-align:right}
#local-volumes-root .mute{min-height:32px;font-size:12px;padding:6px 10px;background:var(--lv-input)}
#local-volumes-root .mute[aria-pressed=true]{color:var(--text-danger,#ff8c91)}
#local-volumes-root .members{margin:4px 0 12px;line-height:19px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#local-volumes-root .range{width:100%;margin:7px 0 3px;appearance:none;height:6px;border-radius:6px;background:linear-gradient(to right,var(--lv-accent) 0%,var(--lv-accent) var(--fill),var(--lv-input) var(--fill),var(--lv-input) 100%);cursor:pointer}
#local-volumes-root .range::-webkit-slider-thumb{appearance:none;width:12px;height:20px;border:1px solid var(--lv-muted);border-radius:4px;background:var(--interactive-active,#f3f3f5);box-shadow:0 1px 3px #0005}
#local-volumes-root .range:disabled{opacity:.5}
#local-volumes-root .scale{display:flex;justify-content:space-between;margin-top:3px;font-size:10px;color:var(--lv-muted)}
#local-volumes-root .group-bottom{margin-top:9px;display:flex;justify-content:space-between;align-items:center}
#local-volumes-root .link{min-height:28px;font-size:12px;color:var(--text-link,#75b8ff);padding:4px 0}
#local-volumes-root .link:not(:disabled):hover,#local-volumes-root .link:not(:disabled):active{background:transparent;text-decoration:underline;text-underline-offset:3px}
#local-volumes-root .notice .link{margin-left:8px}
#local-volumes-root .footer{padding:12px 18px;border-top:1px solid var(--lv-border);display:grid;gap:10px}
#local-volumes-root .primary{background:var(--lv-accent);color:var(--white,#fff);font-weight:600}
#local-volumes-root .primary:not(:disabled):hover,#local-volumes-root .primary:not(:disabled):active{background:var(--brand-560,#4752c4)}
#local-volumes-root .secondary{background:var(--lv-input)}
#local-volumes-root .wide{width:100%}
#local-volumes-root .empty{padding:28px 8px;text-align:center;display:grid;gap:10px}
#local-volumes-root .empty p{line-height:21px;color:var(--lv-muted)}
#local-volumes-root .person{padding:12px 0;display:flex;align-items:center;gap:10px}
#local-volumes-root .person+.person{border-top:1px solid var(--lv-border)}
#local-volumes-root .avatar{position:relative;overflow:hidden;width:32px;height:32px;border-radius:50%;display:grid;place-items:center;background:var(--lv-input);font-size:12px;font-weight:650;flex-shrink:0}
#local-volumes-root .notice{margin:12px 18px 0;padding:10px;border-radius:6px;background:var(--lv-input);font-size:12px;line-height:18px}
#local-volumes-root .notice:empty{display:none}
#local-volumes-root .notice.error{color:var(--text-danger,#ff8c91)}
#local-volumes-root .save{font-size:11px;color:var(--lv-muted);margin-left:auto}
#local-volumes-root .editor{padding:16px 0;display:grid;gap:16px}
#local-volumes-root .field{display:grid;gap:7px;font-size:12px;font-weight:600}
#local-volumes-root .field input{width:100%;padding:10px;border:1px solid var(--lv-border);border-radius:6px;background:var(--lv-input);color:inherit;font-size:14px}
#local-volumes-root .check{display:flex;align-items:center;gap:10px;padding:10px 8px;margin-inline:-8px;border-radius:6px;cursor:pointer}
#local-volumes-root .check:not(:has(input:disabled)):hover{background:var(--lv-hover)}
#local-volumes-root .check:has(input:focus-visible){outline:2px solid var(--focus-primary,#00a8fc);outline-offset:2px}
#local-volumes-root .check input{accent-color:var(--lv-accent);width:17px;height:17px;margin:0;flex-shrink:0}
#local-volumes-root .check .grow{overflow-wrap:anywhere}
#local-volumes-root .danger{color:var(--text-danger,#ff8c91)}
#local-volumes-root .hint{font-size:12px;line-height:18px;color:var(--lv-muted);padding:12px 0}
#local-volumes-root .error-line{font-size:12px;color:var(--text-danger,#ff8c91)}
#local-volumes-root kbd{font:11px var(--font-code,monospace);background:var(--lv-input);padding:2px 5px;border-radius:4px}
#local-volumes-root kbd.shortcut-value{justify-self:start;font-size:16px;padding:8px 12px}
#local-volumes-root .inline-number{width:66px;padding:3px 5px;border:1px solid var(--lv-border);border-radius:4px;background:var(--lv-input);color:inherit;text-align:right;font-variant-numeric:tabular-nums}
#local-volumes-root .avatar img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
#local-volumes-root .member-identity{display:flex;align-items:center;gap:8px;min-width:0}
#local-volumes-root .header h1{overflow-wrap:anywhere}
#local-volumes-root .member-list{margin-top:14px}
#local-volumes-root .member-row{display:grid;grid-template-columns:minmax(0,1fr) 58px 12px 44px;align-items:center;gap:8px;padding:8px 0}
#local-volumes-root .member-row .inline-number{width:58px}
#local-volumes-root .member-row .stack{gap:0}
#local-volumes-root .member-row small{font-size:11px}
#local-volumes-root .member-reset{padding:4px 5px;font-size:11px;min-height:28px}
#local-volumes-root .member-reset:disabled{opacity:.3}
@media(max-width:540px){#local-volumes-root .panel{left:12px;bottom:64px;max-height:calc(100dvh - 84px)}}
@media(prefers-reduced-motion:no-preference){#local-volumes-root .panel:popover-open{animation:appear .12s ease-out}
@keyframes appear{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:translateY(0)}}}
`;
