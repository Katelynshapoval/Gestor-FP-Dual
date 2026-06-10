export const FILTER_SELECT_CLASS =
  "bg-white border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/50 transition-all duration-200";

export const FILTER_LABEL_CLASS =
  "text-[0.8rem] font-semibold whitespace-nowrap text-muted";

export const SPECIALITY_SELECT_CLASS = `${FILTER_SELECT_CLASS} w-full sm:w-auto sm:min-w-[320px] lg:min-w-[420px]`;

export const buildYearOptions = (count) =>
  Array.from({ length: count }, (_, i) => {
    const year = new Date().getFullYear() - i;
    return { value: String(year), label: `${year}/${year + 1}` };
  });
