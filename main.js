const countDisplay = document.getElementById("count");
const incrementButton = document.getElementById("increment");
let count = 0;

incrementButton.addEventListener("click", () => {
  count += 1;
  countDisplay.textContent = `カウント: ${count}`;
});
