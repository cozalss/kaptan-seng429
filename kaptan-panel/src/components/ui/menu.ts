/**
 * One look for every drop-down menu (the role picker, the settings menu): a panel sheet laid
 * on top (ink border + hard shadow), dropping from its trigger and lifting away quickly.
 */
export const MENU_CONTENT =
  "z-50 min-w-[180px] border-[1.5px] border-ink bg-panel py-1 shadow-ink origin-[var(--radix-dropdown-menu-content-transform-origin)] data-[state=open]:animate-[menu-in_160ms_var(--ease-out-expo)] data-[state=closed]:animate-[fade-out_100ms_var(--ease-out-expo)]";

/** A plain menu row: a 46px target, washed when highlighted by pointer or keys. */
export const MENU_ITEM = "block cursor-pointer px-4 py-3 text-ui text-ink outline-none data-[highlighted]:bg-wash-tint";
