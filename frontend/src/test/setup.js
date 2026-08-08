import '@testing-library/jest-dom';

// jsdom has no layout engine, so scrollIntoView is undefined. Several views
// scroll their message stream on every update; stub it so those effects run.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function () {};
}
