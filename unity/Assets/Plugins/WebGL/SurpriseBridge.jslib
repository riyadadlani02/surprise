mergeInto(LibraryManager.library, {
  SurprisePublish: function (ptr) {
    var s = UTF8ToString(ptr);
    window.__surprise = JSON.parse(s);
    if (window.__surpriseOnPublish) window.__surpriseOnPublish(window.__surprise);
  }
});
