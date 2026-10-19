const navigation = document.querySelector(".navigation");
const menuMobile = document.querySelector(".menu-mobile");
const menuLinks = document.querySelectorAll(".navigation nav a");

// Ouvrir / fermer le menu
menuMobile.addEventListener("click", function () {
    navigation.classList.toggle("active");

    const menuOuvert = navigation.classList.contains("active");

    menuMobile.setAttribute(
        "aria-label",
        menuOuvert ? "Fermer le menu" : "Ouvrir le menu"
    );

    menuMobile.textContent = menuOuvert ? "✕" : "☰";
});


// Fermer le menu lorsqu'on clique sur un lien
menuLinks.forEach(function (link) {
    link.addEventListener("click", function () {
        navigation.classList.remove("active");

        menuMobile.textContent = "☰";

        menuMobile.setAttribute(
            "aria-label",
            "Ouvrir le menu"
        );
    });
});


// Fermer le menu lorsqu'on clique en dehors
document.addEventListener("click", function (event) {

    if (
        !navigation.contains(event.target) &&
        navigation.classList.contains("active")
    ) {
        navigation.classList.remove("active");

        menuMobile.textContent = "☰";

        menuMobile.setAttribute(
            "aria-label",
            "Ouvrir le menu"
        );
    }
});


// Fermer avec la touche Échap
document.addEventListener("keydown", function (event) {

    if (event.key === "Escape") {

        navigation.classList.remove("active");

        menuMobile.textContent = "☰";

        menuMobile.setAttribute(
            "aria-label",
            "Ouvrir le menu"
        );
    }
});
