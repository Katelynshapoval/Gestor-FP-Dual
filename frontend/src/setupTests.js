// Jest setup (react-scripts test): DOM matchers such as toBeInTheDocument.
import "@testing-library/jest-dom";

// jsdom does not lay out pages, so it has no scrollIntoView; lists call it to
// keep the selected row visible.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function scrollIntoView() {};
}

// jsdom has no object URLs; the PDF viewer turns downloaded files into one.
if (!URL.createObjectURL) URL.createObjectURL = () => "blob:prueba";
if (!URL.revokeObjectURL) URL.revokeObjectURL = () => {};
