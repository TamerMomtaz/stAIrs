/* ═══════════════════════════════════════════════════════════════════
   Stairs — <ViewHeader />

   Six of the ten sidebar views rendered straight into content, so the
   only cue to where you were was which nav item happened to be lit. The
   title here deliberately repeats the sidebar label word for word: a
   heading that disagrees with the nav is worse than none.

   `right` takes whatever the view already had in its top row — export
   buttons, counts, a refresh — so adding a heading doesn't cost a
   layout.
   ═══════════════════════════════════════════════════════════════════ */

export const ViewHeader = ({ title, subtitle, right }) => (
  <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
    <div className="min-w-0">
      <h2 className="text-lg font-semibold text-white">{title}</h2>
      {subtitle && <p className="text-gray-500 text-xs mt-1">{subtitle}</p>}
    </div>
    {right && <div className="flex items-center gap-3 flex-wrap shrink-0">{right}</div>}
  </div>
);

export default ViewHeader;
