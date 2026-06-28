export const FILTER_SELECT_CLASS =
  "rounded-lg border border-surface-200 bg-white px-3 py-2 text-sm text-charcoal-900 outline-none transition-colors duration-150 focus:outline-none focus-visible:border-brand-700 focus-visible:ring-2 focus-visible:ring-brand-500/20";

export const FILTER_LABEL_CLASS =
  "text-[0.8rem] font-semibold whitespace-nowrap text-muted";

export const SPECIALITY_SELECT_CLASS = `${FILTER_SELECT_CLASS} w-full sm:w-auto sm:min-w-80 lg:min-w-96`;

export const buildYearOptions = (count) =>
  Array.from({ length: count }, (_, i) => {
    const year = new Date().getFullYear() - i;
    return { value: String(year), label: `${year}/${year + 1}` };
  });
