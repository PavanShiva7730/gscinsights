chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "GET_PAGE_CONTENT") {
    const title = document.title || "";
    const h1 = document.querySelector("h1")?.innerText || "";
    const metaDesc = document.querySelector('meta[name="description"]')?.content || "";
    const breadcrumb = [...document.querySelectorAll(".breadcrumb, nav a, .breadcrumbs span")]
      .map(el => el.innerText).join(" > ") || "";
    const bodySnippet = document.body.innerText.substring(0, 1500);

    sendResponse({ title, h1, metaDesc, breadcrumb, bodySnippet });
  }
  return true;
});
