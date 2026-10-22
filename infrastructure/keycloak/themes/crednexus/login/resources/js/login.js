(function () {
  "use strict";

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
