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

  function disableSavedUsername() {
    var username = document.getElementById("username");
    if (!username || username.dataset.userEdited === "true") {
      return;
    }

    username.setAttribute("autocomplete", "off");
    username.setAttribute("autocapitalize", "none");
    username.setAttribute("spellcheck", "false");
    if (username.value) {
      username.value = "";
      username.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }

  var username = document.getElementById("username");
  if (username) {
    function markUserEdited() {
      username.dataset.userEdited = "true";
    }

    username.addEventListener("keydown", markUserEdited);
    username.addEventListener("paste", markUserEdited);
    username.addEventListener("drop", markUserEdited);
    username.addEventListener("input", function () {
      if (username.value) {
        username.dataset.userEdited = "true";
      }
    });
  }

  disableSavedUsername();
  window.setTimeout(disableSavedUsername, 100);
  window.setTimeout(disableSavedUsername, 500);
  window.setTimeout(disableSavedUsername, 1200);
})();
