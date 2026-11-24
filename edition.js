(function () {
  var date = new Date().toLocaleDateString("en-GB", {
    timeZone: "America/Edmonton",
    day: "numeric",
    month: "long",
    year: "numeric"
  });
  var nodes = document.querySelectorAll(".edition");
  for (var i = 0; i < nodes.length; i++) {
    nodes[i].textContent = date;
  }
})();
