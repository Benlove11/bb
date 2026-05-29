const urlText = "www.lizhi334.com";
const urlBox = document.querySelector("#site-url");
const copyButton = document.querySelector("#copy-url");
const toast = document.querySelector("#toast");

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");

  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    toast.classList.remove("show");
  }, 1600);
}

copyButton.addEventListener("click", async () => {
  if (urlBox.classList.contains("is-hidden")) {
    urlBox.textContent = urlText;
    urlBox.classList.remove("is-hidden");
    copyButton.textContent = "复制网址";
    showToast("最新网址已显示");
    return;
  }

  try {
    await navigator.clipboard.writeText(urlText);
    showToast("网址已复制");
  } catch {
    showToast("复制失败，请手动复制");
  }
});
