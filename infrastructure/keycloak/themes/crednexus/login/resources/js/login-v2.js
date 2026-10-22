(function () {
  "use strict";

  // This script is shared by all pages in the login theme, including recovery and errors.
  var themeScript = document.currentScript;
  if (themeScript) {
    var favicon = document.querySelector('link[rel="icon"]');
    if (!favicon) {
      favicon = document.createElement("link");
      favicon.rel = "icon";
      document.head.appendChild(favicon);
    }
    favicon.type = "image/svg+xml";
    favicon.href = new URL("../img/favicon.svg", themeScript.src).href;
  }

  function configureUsername() {
    var username = document.getElementById("username");
    if (!username) {
      return;
    }
    username.setAttribute("autocomplete", "username");
    username.setAttribute("autocapitalize", "none");
    username.setAttribute("spellcheck", "false");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", configureUsername, { once: true });
  } else {
    configureUsername();
  }
})();
