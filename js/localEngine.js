var encodedLocalMusic = localMusic.map(item => ({
  name: item.name,
  artist: item.artist,
  album: item.album || '未分类专辑',
  url: encodeNonAscii(item.url),
  cover: encodeNonAscii(item.cover),
  lrc: encodeNonAscii(item.lrc)
}));

document.getElementById('heoMusic-page').classList.add('localMusic');

function encodeNonAscii(str) {
  return str.replace(/[^\x00-\x7F]/g, function(c) {
    return encodeURIComponent(c);
  });
}

window.ap = new APlayer({
  container: document.getElementById('heoMusic-page'),
  lrcType: 3,
  audio: encodedLocalMusic,
  listFolded: window.innerWidth < 768 ? true : false
});

heo.setupMediaSessionHandlers(window.ap);
heo.setupSongSearch(window.ap);
heo.setupPlaybackMemory(window.ap);
heo.setupMobileExperience(window.ap);
