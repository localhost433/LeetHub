function handleMessage(request, sender) {
  if (!request || request.closeWebPage !== true) return;

  if (request.isSuccess === true) {
    chrome.storage.local.set({ leethub_username: request.username });
    chrome.storage.local.set({ leethub_token: request.token });
    chrome.storage.local.set({ pipe_leethub: false }, () => {
      console.log('Closed pipe.');
    });

    if (sender && sender.tab && typeof sender.tab.id === 'number') {
      chrome.tabs.remove(sender.tab.id);
    }

    const urlOnboarding = chrome.runtime.getURL('welcome.html');
    chrome.tabs.create({ url: urlOnboarding, active: true });
    return;
  }

  if (request.isSuccess === false) {
    console.error('LeetHub auth failed.');
    chrome.storage.local.set({ pipe_leethub: false });
    if (sender && sender.tab && typeof sender.tab.id === 'number') {
      chrome.tabs.remove(sender.tab.id);
    }
  }
}

chrome.runtime.onMessage.addListener(handleMessage);
