var local = false;
var isScrolling = false; // 添加全局变量 isScrolling，默认为 false
var scrollTimer = null; // 添加定时器变量
var animationFrameId = null; // 添加变量用于跟踪动画帧ID
var authScreenActive = false;
var playerScriptLoaded = false;
var navidromeSessionStorageKey = 'heomusic.navidrome.session';
var navidromeApiVersion = '1.16.1';
var navidromeClientName = 'HeoMusic';
var lastLyricScrollKey = '';
var playbackStateStorageKey = 'heomusic.playback.state';

if (typeof userId === 'undefined') {
  var userId = "8152976493"; // 替换为实际的默认值
}
if (typeof userServer === 'undefined') {
  var userServer = "netease"; // 替换为实际的默认值
}
if (typeof userType === 'undefined') {
  var userType = "playlist"; // 替换为实际的默认值
}

bootstrapMusicSource();

function bootstrapMusicSource() {
  if (shouldUseNavidrome()) {
    if (needsNavidromeLogin()) {
      renderNavidromeLogin();
      return;
    }

    fetchNavidromeMusic()
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          localMusic = data;
        }
        authScreenActive = false;
        loadMusicScript();
        ensureNavidromeLogoutButton();
      })
      .catch(error => {
        console.error('Error fetching Navidrome music:', error);
        if (isUnauthorizedError(error)) {
          clearNavidromeSession();
          renderNavidromeLogin('登录状态已失效，请重新登录 Navidrome。');
          return;
        }
        bootstrapRemoteMusic();
      });
    return;
  }

  bootstrapRemoteMusic();
}

function bootstrapRemoteMusic() {
  hideNavidromeLogoutButton();
  if (typeof remoteMusic !== 'undefined' && remoteMusic) {
    fetch(remoteMusic)
      .then(response => response.json())
      .then(data => {
        if (Array.isArray(data)) {
          localMusic = data;
        }
        loadMusicScript();
      })
      .catch(error => {
        console.error('Error fetching remoteMusic:', error);
        loadMusicScript();
      });
  } else {
    loadMusicScript();
  }
}

function hasNavidromeConfig() {
  return typeof navidromeConfig !== 'undefined' &&
    navidromeConfig &&
    navidromeConfig.enabled &&
    navidromeConfig.server;
}

function shouldUseNavidrome() {
  return hasNavidromeConfig();
}

function needsNavidromeLogin() {
  return shouldUseNavidrome() && !hasAuthenticatedNavidromeAccess();
}

function hasAuthenticatedNavidromeAccess() {
  return !!(getNavidromeUsername() && getNavidromePasswordToken());
}

function getStoredNavidromeSession() {
  if (!window.localStorage) {
    return null;
  }

  try {
    var rawValue = localStorage.getItem(navidromeSessionStorageKey);
    if (!rawValue) {
      return null;
    }

    var session = JSON.parse(rawValue);
    if (!session || !session.server || normalizeBaseUrl(session.server) !== normalizeBaseUrl(navidromeConfig.server)) {
      return null;
    }

    return session;
  } catch (error) {
    console.error('Failed to parse Navidrome session:', error);
    return null;
  }
}

function saveNavidromeSession(session) {
  if (!window.localStorage) {
    return;
  }

  localStorage.setItem(navidromeSessionStorageKey, JSON.stringify({
    server: normalizeBaseUrl(navidromeConfig.server),
    username: session.username,
    passwordToken: session.passwordToken,
    userName: session.userName || ''
  }));
}

function clearNavidromeSession() {
  if (window.localStorage) {
    localStorage.removeItem(navidromeSessionStorageKey);
  }
  hideNavidromeLogoutButton();
}

function getNavidromeSession() {
  return getStoredNavidromeSession();
}

function getNavidromeUsername() {
  var session = getNavidromeSession();
  if (session && session.username) {
    return session.username;
  }
  return '';
}

function getNavidromePasswordToken() {
  var session = getNavidromeSession();
  if (session && session.passwordToken) {
    return session.passwordToken;
  }
  return '';
}

function isUnauthorizedError(error) {
  return !!(error && error.status === 401);
}

function renderNavidromeLogin(message) {
  var container = document.getElementById('heoMusic-page');
  authScreenActive = true;
  local = false;
  hideNavidromeLogoutButton();

  if (!container) {
    return;
  }

  container.classList.remove('localMusic');
  container.classList.add('emby-auth-mode');
  container.innerHTML = '' +
    '<div class="emby-login-shell">' +
      '<div class="emby-login-card">' +
        '<div class="emby-login-copy">' +
          '<p class="emby-login-kicker">私人音乐库</p>' +
          '<h1 class="emby-login-title"></h1>' +
          '<p class="emby-login-subtitle"></p>' +
        '</div>' +
        '<form class="emby-login-form" id="emby-login-form">' +
          '<label class="emby-login-field">' +
            '<span>账号</span>' +
            '<input id="emby-username" name="username" type="text" autocomplete="username" placeholder="输入账号" required />' +
          '</label>' +
          '<label class="emby-login-field">' +
            '<span>密码</span>' +
            '<input id="emby-password" name="password" type="password" autocomplete="current-password" placeholder="输入密码" required />' +
          '</label>' +
          '<p class="emby-login-status" id="emby-login-status"></p>' +
          '<button class="emby-login-submit" id="emby-login-submit" type="submit">登录并同步音乐库</button>' +
        '</form>' +
      '</div>' +
    '</div>';

  container.querySelector('.emby-login-title').textContent = navidromeConfig.title || '登录 Navidrome 音乐库';
  container.querySelector('.emby-login-subtitle').textContent = navidromeConfig.subtitle || '使用你的 Navidrome 账号进入播放器。';

  bindNavidromeLoginForm(message);
}

function bindNavidromeLoginForm(message) {
  var form = document.getElementById('emby-login-form');
  var usernameInput = document.getElementById('emby-username');
  var passwordInput = document.getElementById('emby-password');
  var submitButton = document.getElementById('emby-login-submit');

  if (!form || !usernameInput || !passwordInput || !submitButton) {
    return;
  }

  setNavidromeLoginStatus(message || '');
  usernameInput.focus();

  form.addEventListener('submit', function(event) {
    event.preventDefault();

    var username = usernameInput.value.trim();
    var password = passwordInput.value;

    if (!username || !password) {
      setNavidromeLoginStatus('请输入 Navidrome 账号和密码。', true);
      return;
    }

    submitButton.disabled = true;
    submitButton.textContent = '登录中...';
    setNavidromeLoginStatus('正在连接 Navidrome 服务器...');

    authenticateNavidrome(username, password)
      .then(function(session) {
        saveNavidromeSession(session);
        setNavidromeLoginStatus('登录成功，正在加载歌曲...');
        bootstrapMusicSource();
      })
      .catch(function(error) {
        console.error('Navidrome login failed:', error);
        var errorMessage = error && error.message ? error.message : '登录失败，请检查账号、密码或服务器配置。';
        setNavidromeLoginStatus(errorMessage, true);
      })
      .finally(function() {
        submitButton.disabled = false;
        submitButton.textContent = '登录并同步音乐库';
      });
  });
}

function setNavidromeLoginStatus(message, isError) {
  var statusElement = document.getElementById('emby-login-status');

  if (!statusElement) {
    return;
  }

  statusElement.textContent = message || '';
  statusElement.classList.toggle('is-error', !!(message && isError));
  statusElement.classList.toggle('is-success', !!(message && !isError));
}

function normalizeBaseUrl(url) {
  return String(url || '').replace(/\/+$/, '');
}

function encodePasswordForSubsonic(password) {
  return 'enc:' + Array.prototype.map.call(String(password || ''), function(character) {
    return character.charCodeAt(0).toString(16).padStart(2, '0');
  }).join('');
}

function buildNavidromeAuthParams() {
  return {
    u: getNavidromeUsername(),
    p: getNavidromePasswordToken(),
    v: navidromeApiVersion,
    c: navidromeClientName,
    f: 'json'
  };
}

function buildNavidromeQuery(extraParams) {
  var params = Object.assign({}, buildNavidromeAuthParams(), extraParams || {});
  var query = new URLSearchParams();

  Object.keys(params).forEach(function(key) {
    if (params[key] !== undefined && params[key] !== null && params[key] !== '') {
      query.set(key, params[key]);
    }
  });

  return query;
}

function fetchNavidromeJson(endpoint, extraParams) {
  var baseUrl = normalizeBaseUrl(navidromeConfig.server);
  var url = baseUrl + '/rest/' + endpoint + '?' + buildNavidromeQuery(extraParams).toString();

  return fetch(url)
    .then(function(response) {
      if (!response.ok) {
        var networkError = new Error('Navidrome request failed with status ' + response.status);
        networkError.status = response.status;
        throw networkError;
      }

      return response.json();
    })
    .then(function(payload) {
      var body = payload['subsonic-response'];
      if (!body) {
        throw new Error('Navidrome 返回数据格式异常。');
      }
      if (body.status !== 'ok') {
        var error = new Error(body.error && body.error.message ? body.error.message : 'Navidrome 请求失败。');
        if (body.error && typeof body.error.code !== 'undefined') {
          error.subsonicCode = body.error.code;
        }
        if (body.error && Number(body.error.code) === 40) {
          error.status = 401;
        }
        throw error;
      }

      return body;
    });
}

function authenticateNavidrome(username, password) {
  var passwordToken = encodePasswordForSubsonic(password);

  return fetchNavidromeJson('ping', {
    u: username,
    p: passwordToken
  }).then(function() {
    return {
      username: username,
      passwordToken: passwordToken,
      userName: username
    };
  }).catch(function(error) {
    if (error && (error.status === 401 || error.subsonicCode === 40)) {
      error.message = '账号或密码错误，请重新输入。';
    }
    throw error;
  });
}

function fetchNavidromeMusic() {
  return fetchAllNavidromeAlbums()
    .then(function(albums) {
      return Promise.all(albums.map(function(album) {
        return fetchNavidromeJson('getAlbum', { id: album.id })
          .then(function(body) {
            return body.album && Array.isArray(body.album.song) ? body.album.song : [];
          });
      }));
    })
    .then(function(albumSongs) {
      var allSongs = [];
      albumSongs.forEach(function(songs) {
        songs.forEach(function(song) {
          allSongs.push(song);
        });
      });

      var seenIds = {};
      return allSongs.filter(function(song) {
        if (!song || !song.id || seenIds[song.id]) {
          return false;
        }
        seenIds[song.id] = true;
        return true;
      });
    })
    .then(function(songs) {
      return Promise.all(songs.map(buildNavidromeAudioItem));
    });
}

function fetchAllNavidromeAlbums() {
  var albums = [];
  var pageSize = Number(navidromeConfig.albumPageSize || 200);
  var maxAlbums = Number(navidromeConfig.maxAlbums || 1000);

  function loadPage(offset) {
    return fetchNavidromeJson('getAlbumList2', {
      type: 'alphabeticalByArtist',
      size: pageSize,
      offset: offset,
      musicFolderId: navidromeConfig.musicFolderId || undefined
    }).then(function(body) {
      var pageAlbums = body.albumList2 && Array.isArray(body.albumList2.album) ? body.albumList2.album : [];
      albums = albums.concat(pageAlbums);

      if (!pageAlbums.length || pageAlbums.length < pageSize || albums.length >= maxAlbums) {
        return albums.slice(0, maxAlbums);
      }

      return loadPage(offset + pageSize);
    });
  }

  return loadPage(0);
}

function buildNavidromeAudioItem(song) {
  var lyricPromise = fetchNavidromeLyrics(song)
    .catch(function(error) {
      console.error('Failed to fetch Navidrome lyrics for song ' + song.id + ':', error);
      return '';
    });

  return lyricPromise.then(function(lyricBlobUrl) {
    return {
      name: song.title || '未命名音轨',
      artist: song.artist || song.albumArtist || '未知艺术家',
      album: song.album || '未分类专辑',
      url: buildNavidromeStreamUrl(song.id),
      cover: buildNavidromeCoverUrl(song.coverArt || song.albumId || song.id),
      lrc: lyricBlobUrl || ''
    };
  });
}

function fetchNavidromeLyrics(song) {
  return fetchNavidromeJson('getLyricsBySongId', { id: song.id })
    .then(function(body) {
      return extractNavidromeLyricText(body);
    })
    .then(function(lyricText) {
      if (lyricText) {
        return buildLyricBlobUrl(lyricText);
      }

      return fetchNavidromeJson('getLyrics', {
        artist: song.artist || song.albumArtist || '',
        title: song.title || ''
      }).then(function(body) {
        var fallbackLyric = extractNavidromeLyricText(body);
        if (!fallbackLyric) {
          return '';
        }
        return buildLyricBlobUrl(fallbackLyric);
      });
    });
}

function buildLyricBlobUrl(lyricText) {
  var normalizedLyric = normalizeLyricText(lyricText);
  if (!normalizedLyric) {
    return '';
  }

  return URL.createObjectURL(new Blob([normalizedLyric], { type: 'text/plain;charset=utf-8' }));
}

function extractNavidromeLyricText(body) {
  var structuredLyrics = body.lyricsList && Array.isArray(body.lyricsList.structuredLyrics)
    ? body.lyricsList.structuredLyrics
    : [];
  var plainLyrics = body.lyricsList && Array.isArray(body.lyricsList.lyrics)
    ? body.lyricsList.lyrics
    : [];

  if (structuredLyrics.length) {
    return convertNavidromeStructuredLyricsToLrc(structuredLyrics[0]);
  }

  if (plainLyrics.length) {
    return convertNavidromePlainLyricsToLrc(plainLyrics[0]);
  }

  return '';
}

function convertNavidromeStructuredLyricsToLrc(structuredLyric) {
  if (!structuredLyric || !Array.isArray(structuredLyric.line)) {
    return '';
  }

  return structuredLyric.line.map(function(line) {
    var start = line.start || line.value || '0';
    var text = (line.value || '').trim();
    if (!text) {
      return '';
    }

    return '[' + formatNavidromeMilliseconds(start) + ']' + text;
  }).filter(Boolean).join('\n');
}

function convertNavidromePlainLyricsToLrc(plainLyric) {
  if (!plainLyric) {
    return '';
  }

  if (plainLyric.value && /\[(\d{2}):(\d{2})(\.(\d{1,3}))?]/.test(plainLyric.value)) {
    return plainLyric.value;
  }

  if (plainLyric.value) {
    return plainLyric.value.split('\n').map(function(line, index) {
      return '[' + formatNavidromeMilliseconds(index * 3000) + ']' + line.trim();
    }).filter(function(line) {
      return !/\]\s*$/.test(line);
    }).join('\n');
  }

  return '';
}

function formatNavidromeMilliseconds(value) {
  var totalMs = Number(value || 0);
  var totalSeconds = Math.floor(totalMs / 1000);
  var minutes = Math.floor(totalSeconds / 60);
  var seconds = totalSeconds % 60;
  var hundredths = Math.floor((totalMs % 1000) / 10);

  return String(minutes).padStart(2, '0') + ':' +
    String(seconds).padStart(2, '0') + '.' +
    String(hundredths).padStart(2, '0');
}

function buildNavidromeStreamUrl(songId) {
  return normalizeBaseUrl(navidromeConfig.server) + '/rest/stream?' +
    buildNavidromeQuery({ id: songId }).toString();
}

function buildNavidromeCoverUrl(coverId) {
  if (!coverId) {
    return './img/icon.webp';
  }

  return normalizeBaseUrl(navidromeConfig.server) + '/rest/getCoverArt?' +
    buildNavidromeQuery({
      id: coverId,
      size: navidromeConfig.coverSize || 600
    }).toString();
}

function normalizeLyricText(text) {
  var lyricText = String(text || '').trim();

  if (!lyricText) {
    return '';
  }

  if (/\[(\d{2}):(\d{2})(\.(\d{1,3}))?]/.test(lyricText)) {
    return lyricText;
  }

  if (/^WEBVTT/m.test(lyricText) || lyricText.indexOf('-->') !== -1) {
    return convertTimedTextToLrc(lyricText);
  }

  return '';
}

function convertTimedTextToLrc(text) {
  var lines = String(text || '')
    .replace(/\r/g, '')
    .split('\n');
  var output = [];
  var i = 0;

  while (i < lines.length) {
    var line = lines[i].trim();

    if (!line || /^WEBVTT$/i.test(line) || /^NOTE\b/i.test(line)) {
      i += 1;
      continue;
    }

    if (/^\d+$/.test(line) && lines[i + 1] && lines[i + 1].indexOf('-->') !== -1) {
      i += 1;
      line = lines[i].trim();
    }

    if (line.indexOf('-->') === -1) {
      i += 1;
      continue;
    }

    var startTime = line.split('-->')[0].trim();
    var textLines = [];
    i += 1;

    while (i < lines.length && lines[i].trim()) {
      textLines.push(lines[i].trim());
      i += 1;
    }

    var content = textLines
      .join(' ')
      .replace(/<[^>]+>/g, '')
      .replace(/\{[^}]+\}/g, '')
      .trim();

    if (content) {
      output.push('[' + formatTimedTextAsLrc(startTime) + ']' + content);
    }

    i += 1;
  }

  return output.join('\n');
}

function formatTimedTextAsLrc(timestamp) {
  var normalized = String(timestamp || '')
    .replace(',', '.')
    .trim();
  var match = normalized.match(/(?:(\d{2}):)?(\d{2}):(\d{2})(?:\.(\d{1,3}))?/);

  if (!match) {
    return '00:00.00';
  }

  var hours = parseInt(match[1] || '0', 10);
  var minutes = parseInt(match[2] || '0', 10) + hours * 60;
  var seconds = match[3];
  var fraction = (match[4] || '0').slice(0, 2).padEnd(2, '0');

  return String(minutes).padStart(2, '0') + ':' + seconds + '.' + fraction;
}

function loadMusicScript() {
  var container = document.getElementById('heoMusic-page');

  if (playerScriptLoaded) {
    return;
  }

  if (container) {
    container.classList.remove('emby-auth-mode');
  }

  if (typeof localMusic === 'undefined' || !Array.isArray(localMusic) || localMusic.length === 0) {
    // 如果 localMusic 为空数组或未定义，加载 Meting2.min.js
    var script = document.createElement('script');
    script.src = './js/Meting.js';
    document.body.appendChild(script);
    playerScriptLoaded = true;
  } else {
    // 否则加载 localEngine.js
    var script = document.createElement('script');
    script.src = './js/localEngine.js';
    document.body.appendChild(script);
    local = true;
    playerScriptLoaded = true;
  }
}

function ensureNavidromeLogoutButton() {
  hideNavidromeLogoutButton();
}

function hideNavidromeLogoutButton() {
  var button = document.getElementById('emby-logout-button');
  if (button) {
    button.remove();
  }
}

function logoutNavidromeSession() {
  clearNavidromeSession();
  window.location.reload();
}

var volume = 0.8;

// 获取地址栏参数
// 创建URLSearchParams对象并传入URL中的查询字符串
const params = new URLSearchParams(window.location.search);

var heo = {
  // 处理滚动和触摸事件的通用方法
  handleScrollOrTouch: function(event, isTouchEvent) {
    // 检查事件的目标元素是否在相关区域内部
    let targetElement = event.target;
    let isInTargetArea = false;
    
    // 向上遍历DOM树，检查是否在目标区域内
    while (targetElement && targetElement !== document) {
      if (targetElement.classList) {
        if (isTouchEvent) {
          // 触摸事件检查 aplayer-body 或 aplayer-lrc
          if (targetElement.classList.contains('aplayer-body') || 
              targetElement.classList.contains('aplayer-lrc')) {
            isInTargetArea = true;
            break;
          }
        } else {
          // 鼠标滚轮事件只检查 aplayer-body
          if (targetElement.classList.contains('aplayer-body')) {
            isInTargetArea = true;
            break;
          }
        }
      }
      targetElement = targetElement.parentNode;
    }
    
    // 只有当在目标区域内时才改变 isScrolling
    if (isInTargetArea) {
      // 取消任何正在进行的动画
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }
      
      // 设置isScrolling为true
      isScrolling = true;
      
      // 清除之前的定时器
      if(scrollTimer !== null) {
        clearTimeout(scrollTimer);
      }
      
      // 设置新的定时器，恢复isScrolling为false
      // 触摸事件给予更长的时间
      const timeoutDuration = isTouchEvent ? 4500 : 4000;
      scrollTimer = setTimeout(function() {
        isScrolling = false;
        heo.scrollLyric();
      }, timeoutDuration);
    }
  },
  
  // 初始化滚动和触摸事件
  initScrollEvents: function() {
    // 监听鼠标滚轮事件
    document.addEventListener('wheel', (event) => {
      this.handleScrollOrTouch(event, false);
    }, { passive: true });
    
    // 监听触摸滑动事件
    document.addEventListener('touchmove', (event) => {
      this.handleScrollOrTouch(event, true);
    }, { passive: true });
  },

  scrollLyric: function () {
    // 当 isScrolling 为 true 时，跳过执行
    if (isScrolling) {
      return;
    }
    
    const lrcContent = document.querySelector('.aplayer-lrc');
    const currentLyric = document.querySelector('.aplayer-lrc-current');

    if (lrcContent && currentLyric) {
      let startScrollTop = lrcContent.scrollTop;
      let targetOffset = window.innerWidth < 768
        ? lrcContent.clientHeight * 0.26
        : (window.innerHeight - 150) * 0.3;
      let targetScrollTop = Math.max(currentLyric.offsetTop - targetOffset, 0);
      let distance = targetScrollTop - startScrollTop;
      let duration = 600; // 缩短动画时间以提高流畅度
      let startTime = null;

      function easeOutQuad(t) {
        return t * (2 - t);
      }

      function animateScroll(currentTime) {
        // 如果用户正在手动滚动，停止动画
        if (isScrolling) {
          animationFrameId = null;
          return;
        }
        
        if (startTime === null) startTime = currentTime;
        let timeElapsed = currentTime - startTime;
        let progress = Math.min(timeElapsed / duration, 1);
        let easeProgress = window.innerWidth < 768 ? progress : easeOutQuad(progress);
        lrcContent.scrollTop = startScrollTop + (distance * easeProgress);
        
        if (timeElapsed < duration) {
          animationFrameId = requestAnimationFrame(animateScroll);
        } else {
          animationFrameId = null;
        }
      }

      // 取消任何正在进行的动画
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
      }
      
      animationFrameId = requestAnimationFrame(animateScroll);
    }
  },

  syncLyricScroll: function() {
    var currentLyric = document.querySelector('.aplayer-lrc-current');
    var lyricKey = currentLyric ? currentLyric.textContent + '::' + currentLyric.offsetTop : '';

    if (!lyricKey || lyricKey === lastLyricScrollKey) {
      return;
    }

    lastLyricScrollKey = lyricKey;
    this.scrollLyric();
  },

  getCustomPlayList: function () {
    const heoMusicPage = document.getElementById("heoMusic-page");
    const playlistType = params.get("type") || "playlist";

    if (params.get("id") && params.get("server")) {
      console.log("获取到自定义内容")
      var id = params.get("id")
      var server = params.get("server")
      heoMusicPage.innerHTML = `<meting-js id="${id}" server="${server}" type="${playlistType}" mutex="true" preload="auto" order="random"></meting-js>`;
    } else {
      console.log("无自定义内容")
      heoMusicPage.innerHTML = `<meting-js id="${userId}" server="${userServer}" type="${userType}" mutex="true" preload="auto" order="random"></meting-js>`;
    }
  },

  bindEvents: function () {
    var e = this;
    // 添加歌词点击件
    if (this.lrc) {
      this.template.lrc.addEventListener('click', function (event) {
        // 确保点击的是歌词 p 元素
        var target = event.target;
        if (target.tagName.toLowerCase() === 'p') {
          // 获取所有歌词元素
          var lyrics = e.template.lrc.getElementsByTagName('p');
          // 找到被点击歌词的索引
          for (var i = 0; i < lyrics.length; i++) {
            if (lyrics[i] === target) {
              // 获取对应时间并跳转
              if (e.lrc.current[i]) {
                var time = e.lrc.current[i][0];
                e.seek(time);
                if (e.paused) {
                  e.play();
                }
              }
              break;
            }
          }
        }
      });
    }
  },
  // 添加新方法处理歌词点击
  addLyricClickEvent: function () {
    const lrcContent = document.querySelector('.aplayer-lrc-contents');

    if (lrcContent) {
      lrcContent.addEventListener('click', function (event) {
        if (event.target.tagName.toLowerCase() === 'p') {
          const lyrics = lrcContent.getElementsByTagName('p');
          for (let i = 0; i < lyrics.length; i++) {
            if (lyrics[i] === event.target) {
              // 获取当前播放器实例
              const player = getPlayerInstance();
              if (!player) {
                return;
              }
              // 使用播放器内部的歌词数据
              if (player.lrc.current[i]) {
                const time = player.lrc.current[i][0];
                player.seek(time);
                // 点击歌词后不再等待4s，立即跳转
                isScrolling = false;
                clearTimeout(scrollTimer);
                // 如果当前是暂停状态,则恢复播放
                if (player.paused) {
                  player.play();
                }
              }
              event.stopPropagation(); // 阻止事件冒泡
              break;
            }
          }
        }
      });
    }
  },
  setMediaMetadata: function (aplayerObj, isSongPlaying) {
    const audio = aplayerObj.list.audios[aplayerObj.list.index]
    const coverUrl = audio.cover || './img/icon.webp';
    const currentLrcContent = document.getElementById("heoMusic-page").querySelector(".aplayer-lrc-current").textContent;
    let songName, songArtist;

    if ('mediaSession' in navigator) {
      if (isSongPlaying && currentLrcContent) {
        songName = currentLrcContent;
        songArtist = `${audio.artist} / ${audio.name}`;
      } else {
        songName = audio.name;
        songArtist = audio.artist;
      }
      navigator.mediaSession.metadata = new MediaMetadata({
        title: songName,
        artist: songArtist,
        album: audio.album,
        artwork: [
          { src: coverUrl, sizes: '96x96', type: 'image/jpeg' },
          { src: coverUrl, sizes: '128x128', type: 'image/jpeg' },
          { src: coverUrl, sizes: '192x192', type: 'image/jpeg' },
          { src: coverUrl, sizes: '256x256', type: 'image/jpeg' },
          { src: coverUrl, sizes: '384x384', type: 'image/jpeg' },
          { src: coverUrl, sizes: '512x512', type: 'image/jpeg' }
        ]
      });
    } else {
      console.log('当前浏览器不支持 Media Session API');
      document.title = `${audio.name} - ${audio.artist}`;
    }
  },
  // 响应 MediaSession 标准媒体交互
  setupMediaSessionHandlers: function (aplayer) {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.setActionHandler('play', () => {
        aplayer.play();
      });

      navigator.mediaSession.setActionHandler('pause', () => {
        aplayer.pause();
      });

      // 移除快进快退按钮
      navigator.mediaSession.setActionHandler('seekbackward', null);
      navigator.mediaSession.setActionHandler('seekforward', null);

      // 设置上一曲下一曲按钮
      navigator.mediaSession.setActionHandler('previoustrack', () => {
        aplayer.skipBack();
      });

      navigator.mediaSession.setActionHandler('nexttrack', () => {
        aplayer.skipForward();
      });

      // 响应进度条拖动
      navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (details.fastSeek && 'fastSeek' in aplayer.audio) {
          aplayer.audio.fastSeek(details.seekTime);
        } else {
          aplayer.audio.currentTime = details.seekTime;
        }
      });

      // 更新 Media Session 元数据
      aplayer.on('loadeddata', () => {
        heo.setMediaMetadata(aplayer, false);
      });

      // 更新播放状态
      aplayer.on('play', () => {
        if ('mediaSession' in navigator) {
          navigator.mediaSession.playbackState = 'playing';
          heo.setMediaMetadata(aplayer, true);
        }
      });

      aplayer.on('pause', () => {
        if ('mediaSession' in navigator) {
          navigator.mediaSession.playbackState = 'paused';
          heo.setMediaMetadata(aplayer, false);
        }
      });

      // 监听时间更新事件
      aplayer.on('timeupdate', () => {
        heo.setMediaMetadata(aplayer, true);
      });
    }
  },
  updateThemeColorWithImage(img) {
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
      metaThemeColor.setAttribute('content', '#0d0d0d');
    }
  },
  
  // 新增方法：将歌词滚动到顶部
  scrollLyricToTop: function() {
    const lrcContent = document.querySelector('.aplayer-lrc');
    if (lrcContent) {
      // 使用平滑滚动效果，但不过于缓慢
      lrcContent.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
    }
  },
  
  // 初始化所有事件
  init: function() {
    if (!local && !authScreenActive) {
      this.getCustomPlayList();
    }
    this.initScrollEvents();
  }
}

function getPlayerInstance() {
  if (typeof window !== 'undefined' && window.ap) {
    return window.ap;
  }

  return null;
}

heo.setupSongSearch = function(aplayer) {
  if (!aplayer || !aplayer.template || !aplayer.template.list) {
    return;
  }

  if (document.getElementById('heo-song-search')) {
    return;
  }

  var listContainer = aplayer.template.list;
  var searchShell = document.createElement('div');
  var searchInput = document.createElement('input');
  var emptyState = document.createElement('p');

  searchShell.className = 'heo-song-search';
  searchInput.id = 'heo-song-search';
  searchInput.className = 'heo-song-search-input';
  searchInput.type = 'search';
  searchInput.placeholder = '搜索歌曲 / 歌手';
  searchInput.autocomplete = 'off';

  emptyState.className = 'heo-song-search-empty';
  emptyState.textContent = '没有找到匹配的歌曲';

  searchShell.appendChild(searchInput);
  searchShell.appendChild(emptyState);
  listContainer.insertBefore(searchShell, listContainer.firstChild);

  var applyFilter = function() {
    var keyword = searchInput.value.trim().toLowerCase();
    var items = Array.prototype.slice.call(listContainer.querySelectorAll('ol li'));
    var visibleCount = 0;

    items.forEach(function(item) {
      var title = item.querySelector('.aplayer-list-title');
      var author = item.querySelector('.aplayer-list-author');
      var text = ((title ? title.textContent : '') + ' ' + (author ? author.textContent : '')).toLowerCase();
      var matched = !keyword || text.indexOf(keyword) !== -1;

      item.classList.toggle('heo-song-hidden', !matched);
      if (matched) {
        visibleCount += 1;
      }
    });

    searchShell.classList.toggle('is-empty', visibleCount === 0);
  };

  searchInput.addEventListener('input', applyFilter);
  aplayer.on('listswitch', applyFilter);
  applyFilter();
};

heo.setupPlaybackMemory = function(aplayer) {
  if (!aplayer || !aplayer.list || !Array.isArray(aplayer.list.audios)) {
    return;
  }

  var restoredState = heo.getStoredPlaybackState();
  var saveTimer = null;
  var restoredSeekForTrack = '';

  function queueSave() {
    if (saveTimer) {
      clearTimeout(saveTimer);
    }

    saveTimer = setTimeout(function() {
      heo.savePlaybackState(aplayer);
    }, 120);
  }

  heo.restorePlaybackState(aplayer, restoredState);

  aplayer.on('listswitch', function() {
    restoredSeekForTrack = '';
    queueSave();
  });

  aplayer.on('timeupdate', function() {
    queueSave();
  });

  aplayer.on('pause', function() {
    queueSave();
  });

  aplayer.on('play', function() {
    queueSave();
  });

  aplayer.on('loadedmetadata', function() {
    var activeState = restoredState || heo.getStoredPlaybackState();
    var currentAudio = aplayer.list.audios[aplayer.list.index] || {};
    var currentTrackKey = currentAudio.url || currentAudio.name || '';

    if (!activeState || !currentTrackKey || restoredSeekForTrack === currentTrackKey) {
      return;
    }

    if (activeState.trackUrl === currentAudio.url || activeState.trackName === currentAudio.name) {
      var seekTime = Number(activeState.currentTime || 0);
      if (seekTime > 0 && Math.abs(aplayer.audio.currentTime - seekTime) > 1) {
        aplayer.seek(seekTime);
      }
      restoredSeekForTrack = currentTrackKey;
    }
  });

  if (aplayer.template.order) {
    aplayer.template.order.addEventListener('click', queueSave);
  }
  if (aplayer.template.loop) {
    aplayer.template.loop.addEventListener('click', queueSave);
  }

  window.addEventListener('beforeunload', function() {
    heo.savePlaybackState(aplayer);
  });
};

heo.getStoredPlaybackState = function() {
  try {
    var rawState = localStorage.getItem(playbackStateStorageKey);
    return rawState ? JSON.parse(rawState) : null;
  } catch (error) {
    console.error('Failed to parse playback state:', error);
    return null;
  }
};

heo.savePlaybackState = function(aplayer) {
  if (!aplayer || !aplayer.list || !aplayer.list.audios || !aplayer.list.audios.length) {
    return;
  }

  var currentAudio = aplayer.list.audios[aplayer.list.index] || {};
  var state = {
    index: aplayer.list.index,
    trackName: currentAudio.name || '',
    trackUrl: currentAudio.url || '',
    currentTime: Number(aplayer.audio && !isNaN(aplayer.audio.currentTime) ? aplayer.audio.currentTime : 0),
    loop: aplayer.options.loop || 'all',
    order: aplayer.options.order || 'list'
  };

  localStorage.setItem(playbackStateStorageKey, JSON.stringify(state));
};

heo.restorePlaybackState = function(aplayer, state) {
  if (!state || !aplayer || !aplayer.list || !Array.isArray(aplayer.list.audios) || !aplayer.list.audios.length) {
    return;
  }

  heo.restorePlayerMode(aplayer, state);

  var targetIndex = Number(state.index);
  if (state.trackUrl) {
    var matchedUrlIndex = aplayer.list.audios.findIndex(function(audio) {
      return audio.url === state.trackUrl;
    });
    if (matchedUrlIndex !== -1) {
      targetIndex = matchedUrlIndex;
    }
  } else if (state.trackName) {
    var matchedNameIndex = aplayer.list.audios.findIndex(function(audio) {
      return audio.name === state.trackName;
    });
    if (matchedNameIndex !== -1) {
      targetIndex = matchedNameIndex;
    }
  }

  if (!Number.isNaN(targetIndex) && targetIndex >= 0 && targetIndex < aplayer.list.audios.length && targetIndex !== aplayer.list.index) {
    aplayer.list.switch(targetIndex);
  }
};

heo.restorePlayerMode = function(aplayer, state) {
  if (!state) {
    return;
  }

  if (state.order && aplayer.options.order !== state.order && aplayer.template.order) {
    for (var orderSafety = 0; orderSafety < 3 && aplayer.options.order !== state.order; orderSafety++) {
      aplayer.template.order.click();
    }
  }

  if (state.loop && aplayer.options.loop !== state.loop && aplayer.template.loop) {
    for (var loopSafety = 0; loopSafety < 4 && aplayer.options.loop !== state.loop; loopSafety++) {
      aplayer.template.loop.click();
    }
  }
};

heo.setupMobileExperience = function(aplayer) {
  if (window.innerWidth > 768 || !aplayer || !aplayer.template || !aplayer.template.body || document.getElementById('heo-mobile-panels')) {
    return;
  }

  var body = aplayer.template.body;
  var page = document.getElementById('heoMusic-page');
  var pic = aplayer.template.pic;
  var lrcWrap = aplayer.template.lrcWrap;

  if (!body || !page || !pic || !lrcWrap) {
    return;
  }

  page.classList.add('heo-mobile-ready');
  page.classList.add('heo-mobile-view-playing');

  var tabs = document.createElement('div');
  tabs.className = 'heo-mobile-tabs';
  tabs.innerHTML = '' +
    '<button class="heo-mobile-tab is-active" type="button" data-view="playing">歌曲</button>' +
    '<button class="heo-mobile-tab" type="button" data-view="lyrics">歌词</button>' +
    '<button class="heo-mobile-tab" type="button" data-view="albums">专辑</button>';

  var panels = document.createElement('div');
  panels.id = 'heo-mobile-panels';
  panels.className = 'heo-mobile-panels';

  var nowPanel = document.createElement('section');
  nowPanel.className = 'heo-mobile-panel heo-mobile-now-panel';
  nowPanel.innerHTML = '' +
    '<div class="heo-mobile-now-art">' +
      '<div class="heo-mobile-disc-shell">' +
        '<div class="heo-mobile-vinyl"></div>' +
        '<span class="heo-mobile-disc-mask"></span>' +
      '</div>' +
      '<span class="heo-mobile-tonearm"></span>' +
    '</div>' +
    '<div class="heo-mobile-track">' +
      '<p class="heo-mobile-track-label">Now Playing</p>' +
      '<h2 class="heo-mobile-track-title"></h2>' +
      '<p class="heo-mobile-track-album"></p>' +
      '<div class="heo-mobile-lyric-preview">' +
        '<p class="heo-mobile-lyric-line heo-mobile-lyric-line-current"></p>' +
        '<p class="heo-mobile-lyric-line heo-mobile-lyric-line-next"></p>' +
      '</div>' +
    '</div>';

  var lyricPanel = document.createElement('section');
  lyricPanel.className = 'heo-mobile-panel heo-mobile-lyrics-panel';
  lyricPanel.innerHTML = '' +
    '<div class="heo-mobile-lyrics-now">' +
      '<span class="heo-mobile-lyrics-cover"></span>' +
      '<span class="heo-mobile-lyrics-copy">' +
        '<span class="heo-mobile-lyrics-song"></span>' +
        '<span class="heo-mobile-lyrics-artist"></span>' +
        '<span class="heo-mobile-lyrics-album"></span>' +
      '</span>' +
      '<span class="heo-mobile-lyrics-indicator" aria-hidden="true">' +
        '<i></i><i></i><i></i>' +
      '</span>' +
    '</div>';

  var albumPanel = document.createElement('section');
  albumPanel.className = 'heo-mobile-panel heo-mobile-albums-panel';
  albumPanel.innerHTML = '' +
    '<div class="heo-mobile-albums-head">' +
      '<p class="heo-mobile-albums-kicker">Album Library</p>' +
      '<h2 class="heo-mobile-albums-title">全部专辑</h2>' +
      '<label class="heo-mobile-album-search" for="heo-mobile-album-search">' +
        '<span class="heo-mobile-album-search-icon" aria-hidden="true"></span>' +
        '<input id="heo-mobile-album-search" class="heo-mobile-album-search-input" type="search" placeholder="搜索歌曲 / 歌手" autocomplete="off">' +
      '</label>' +
    '</div>' +
    '<div class="heo-mobile-album-grid" id="heo-mobile-album-grid"></div>' +
    '<section class="heo-mobile-album-detail" id="heo-mobile-album-detail" hidden>' +
      '<div class="heo-mobile-album-detail-shell">' +
        '<button class="heo-mobile-album-detail-close" type="button" aria-label="关闭专辑列表">返回</button>' +
        '<div class="heo-mobile-album-detail-head">' +
          '<span class="heo-mobile-album-detail-cover"></span>' +
          '<div class="heo-mobile-album-detail-copy">' +
            '<p class="heo-mobile-album-detail-kicker">Album</p>' +
            '<h3 class="heo-mobile-album-detail-title"></h3>' +
            '<p class="heo-mobile-album-detail-meta"></p>' +
          '</div>' +
        '</div>' +
        '<div class="heo-mobile-album-detail-list" id="heo-mobile-album-detail-list"></div>' +
      '</div>' +
    '</section>';

  nowPanel.querySelector('.heo-mobile-disc-shell').appendChild(pic);
  lyricPanel.appendChild(lrcWrap);
  panels.appendChild(nowPanel);
  panels.appendChild(lyricPanel);
  panels.appendChild(albumPanel);

  body.insertBefore(tabs, body.firstChild);
  body.insertBefore(panels, tabs.nextSibling);

  if (aplayer.template.controller) {
    aplayer.template.controller.insertBefore(lyricPanel.querySelector('.heo-mobile-lyrics-now'), aplayer.template.controller.firstChild);
  }

  var switchView = function(view) {
    page.classList.remove('heo-mobile-view-playing', 'heo-mobile-view-lyrics', 'heo-mobile-view-albums');
    page.classList.add('heo-mobile-view-' + view);

    if (view !== 'albums') {
      var albumDetail = document.getElementById('heo-mobile-album-detail');
      if (albumDetail) {
        albumDetail.hidden = true;
        albumDetail.classList.remove('is-visible');
      }
      document.body.classList.remove('heo-mobile-album-detail-open');
    }

    Array.prototype.forEach.call(tabs.querySelectorAll('.heo-mobile-tab'), function(button) {
      button.classList.toggle('is-active', button.getAttribute('data-view') === view);
    });
  };

  Array.prototype.forEach.call(tabs.querySelectorAll('.heo-mobile-tab'), function(button) {
    button.addEventListener('click', function() {
      var targetView = button.getAttribute('data-view');
      switchView(targetView);
      if (targetView === 'lyrics') {
        setTimeout(function() {
          heo.scrollLyric();
        }, 80);
      }
    });
  });

  if (aplayer.template.menu) {
    aplayer.template.menu.addEventListener('click', function(event) {
      if (window.innerWidth > 768) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      switchView('albums');
    }, true);
  }

  heo.renderMobileAlbumGrid(aplayer, switchView);
  heo.updateMobileNowPlaying(aplayer);
  aplayer.on('listswitch', function() {
    heo.updateMobileNowPlaying(aplayer);
    lastLyricScrollKey = '';
    heo.scrollLyricToTop();
    setTimeout(function() {
      heo.scrollLyric();
    }, 120);
  });
  aplayer.on('play', function() {
    heo.updateMobileNowPlaying(aplayer);
  });
  aplayer.on('pause', function() {
    heo.updateMobileNowPlaying(aplayer);
  });
  aplayer.on('timeupdate', function() {
    heo.updateMobileNowPlaying(aplayer);
    heo.syncLyricScroll();
  });
};

heo.updateMobileNowPlaying = function(aplayer) {
  var page = document.getElementById('heoMusic-page');
  if (!page || !aplayer || !aplayer.list || !aplayer.list.audios) {
    return;
  }

  var current = aplayer.list.audios[aplayer.list.index] || {};
  var title = page.querySelector('.heo-mobile-track-title');
  var album = page.querySelector('.heo-mobile-track-album');
  var lyricHeaderCover = page.querySelector('.heo-mobile-lyrics-cover');
  var lyricHeaderSong = page.querySelector('.heo-mobile-lyrics-song');
  var lyricHeaderArtist = page.querySelector('.heo-mobile-lyrics-artist');
  var lyricHeaderAlbum = page.querySelector('.heo-mobile-lyrics-album');
  var lyricCurrent = page.querySelector('.heo-mobile-lyric-line-current');
  var lyricNext = page.querySelector('.heo-mobile-lyric-line-next');
  var lyricPreview = heo.getMobileLyricPreview();

  if (title) {
    title.textContent = current.name || '未命名音轨';
  }
  if (album) {
    album.textContent = current.album || current.artist || '未分类专辑';
  }
  if (lyricHeaderCover) {
    lyricHeaderCover.style.backgroundImage = current.cover ? "url('" + current.cover.replace(/'/g, "\\'") + "')" : '';
  }
  if (lyricHeaderSong) {
    lyricHeaderSong.textContent = current.name || '未命名音轨';
  }
  if (lyricHeaderArtist) {
    lyricHeaderArtist.textContent = current.artist || '未知艺术家';
  }
  if (lyricHeaderAlbum) {
    lyricHeaderAlbum.textContent = current.album || '未分类专辑';
  }
  if (lyricCurrent) {
    lyricCurrent.textContent = lyricPreview.current;
  }
  if (lyricNext) {
    lyricNext.textContent = lyricPreview.next;
  }
};

heo.getMobileLyricPreview = function() {
  var currentLine = document.querySelector('.aplayer-lrc-current');
  var nextLine = currentLine ? currentLine.nextElementSibling : null;
  var currentText = currentLine ? currentLine.textContent.trim() : '';
  var nextText = nextLine ? nextLine.textContent.trim() : '';

  if (!currentText) {
    currentText = '暂无歌词';
  }

  return {
    current: currentText,
    next: nextText || '\u00A0'
  };
};

heo.renderMobileAlbumGrid = function(aplayer, switchView) {
  var grid = document.getElementById('heo-mobile-album-grid');
  var detail = document.getElementById('heo-mobile-album-detail');
  var detailList = document.getElementById('heo-mobile-album-detail-list');
  var searchInput = document.getElementById('heo-mobile-album-search');
  if (!grid || !aplayer || !aplayer.list || !Array.isArray(aplayer.list.audios)) {
    return;
  }

  var albumMap = {};

  aplayer.list.audios.forEach(function(audio, index) {
    var albumName = (audio.album || '未分类专辑').trim();
    var albumKey = albumName;

    if (!albumMap[albumKey]) {
      albumMap[albumKey] = {
        title: albumName,
        artist: audio.artist || '未知艺术家',
        cover: audio.cover || './img/icon.webp',
        count: 0,
        songs: []
      };
    }

    albumMap[albumKey].count += 1;
    albumMap[albumKey].songs.push({
      index: index,
      name: audio.name || '未命名音轨',
      artist: audio.artist || '未知艺术家'
    });
  });

  var albums = Object.keys(albumMap).map(function(key) {
    return albumMap[key];
  }).sort(function(left, right) {
    return left.title.localeCompare(right.title, 'zh-Hans-CN');
  });

  var getKeyword = function() {
    return searchInput ? searchInput.value.trim().toLowerCase() : '';
  };

  var filterSongs = function(album, keyword) {
    if (!keyword) {
      return album.songs.slice();
    }

    return album.songs.filter(function(song) {
      return [
        String(song.name || '').toLowerCase(),
        String(song.artist || '').toLowerCase()
      ].some(function(field) {
        return field.indexOf(keyword) > -1;
      });
    });
  };

  var renderAlbumDetail = function(album) {
    if (!detail || !detailList || !album) {
      return;
    }

    var detailCover = detail.querySelector('.heo-mobile-album-detail-cover');
    var detailTitle = detail.querySelector('.heo-mobile-album-detail-title');
    var detailMeta = detail.querySelector('.heo-mobile-album-detail-meta');

    if (detailCover) {
      detailCover.style.backgroundImage = album.cover ? "url('" + album.cover.replace(/'/g, "\\'") + "')" : '';
    }
    if (detailTitle) {
      detailTitle.textContent = album.title;
    }
    if (detailMeta) {
      detailMeta.textContent = (album.artist || '未知艺术家') + ' · ' + album.count + ' 首';
    }

    detailList.innerHTML = album.songs.length ? album.songs.map(function(song, songIndex) {
      return '' +
        '<button class="heo-mobile-album-detail-song" type="button" data-index="' + song.index + '">' +
          '<span class="heo-mobile-album-detail-song-no">' + String(songIndex + 1).padStart(2, '0') + '</span>' +
          '<span class="heo-mobile-album-detail-song-copy">' +
            '<span class="heo-mobile-album-detail-song-name">' + escapeHtml(song.name) + '</span>' +
            '<span class="heo-mobile-album-detail-song-artist">' + escapeHtml(song.artist) + '</span>' +
          '</span>' +
          '<span class="heo-mobile-album-detail-song-mark"></span>' +
        '</button>';
    }).join('') : '<p class="heo-mobile-album-detail-empty">没有找到匹配的歌曲</p>';

    detail.hidden = false;
    detail.classList.add('is-visible');
    document.body.classList.add('heo-mobile-album-detail-open');

    Array.prototype.forEach.call(detailList.querySelectorAll('.heo-mobile-album-detail-song'), function(button) {
      button.addEventListener('click', function() {
        var index = Number(button.getAttribute('data-index'));
        if (!Number.isNaN(index)) {
          aplayer.list.switch(index);
          aplayer.play();
          detail.hidden = true;
          detail.classList.remove('is-visible');
          document.body.classList.remove('heo-mobile-album-detail-open');
          switchView('playing');
        }
      });
    });
  };

  var closeAlbumDetail = function() {
    if (!detail) {
      return;
    }
    detail.hidden = true;
    detail.classList.remove('is-visible');
    document.body.classList.remove('heo-mobile-album-detail-open');
  };

  var renderAlbumCards = function() {
    var keyword = getKeyword();
    if (keyword) {
      var resultSongs = [];

      albums.forEach(function(album) {
        filterSongs(album, keyword).forEach(function(song) {
          resultSongs.push({
            index: song.index,
            name: song.name,
            artist: song.artist,
            album: album.title,
            cover: album.cover
          });
        });
      });

      if (!resultSongs.length) {
        grid.innerHTML = '<p class="heo-mobile-album-empty">没有找到匹配的歌曲</p>';
        closeAlbumDetail();
        return;
      }

      closeAlbumDetail();
      grid.innerHTML = '' +
        '<div class="heo-mobile-search-results">' +
          resultSongs.map(function(song) {
            return '' +
              '<button class="heo-mobile-search-song" type="button" data-index="' + song.index + '">' +
                '<span class="heo-mobile-search-song-cover" style="background-image:url(\'' + String(song.cover || './img/icon.webp').replace(/'/g, "\\'") + '\')"></span>' +
                '<span class="heo-mobile-search-song-copy">' +
                  '<span class="heo-mobile-search-song-name">' + escapeHtml(song.name) + '</span>' +
                  '<span class="heo-mobile-search-song-meta">' + escapeHtml(song.artist) + ' · ' + escapeHtml(song.album) + '</span>' +
                '</span>' +
                '<span class="heo-mobile-search-song-mark"></span>' +
              '</button>';
          }).join('') +
        '</div>';

      Array.prototype.forEach.call(grid.querySelectorAll('.heo-mobile-search-song'), function(button) {
        button.addEventListener('click', function() {
          var index = Number(button.getAttribute('data-index'));
          if (!Number.isNaN(index)) {
            aplayer.list.switch(index);
            aplayer.play();
            switchView('playing');
          }
        });
      });
      return;
    }

    grid.innerHTML = albums.map(function(album) {
      return '' +
        '<article class="heo-mobile-album-card">' +
          '<button class="heo-mobile-album-summary" type="button" data-album="' + escapeHtml(album.title) + '">' +
            '<span class="heo-mobile-album-cover" style="background-image:url(\'' + album.cover.replace(/'/g, "\\'") + '\')"></span>' +
            '<span class="heo-mobile-album-copy">' +
              '<span class="heo-mobile-album-name">' + escapeHtml(album.title) + '</span>' +
              '<span class="heo-mobile-album-meta">' + escapeHtml(album.artist) + ' · ' + album.count + ' 首</span>' +
            '</span>' +
          '</button>' +
        '</article>';
    }).join('');

    Array.prototype.forEach.call(grid.querySelectorAll('.heo-mobile-album-summary'), function(button) {
      button.addEventListener('click', function() {
        var albumTitle = button.getAttribute('data-album');
        var album = albums.find(function(item) {
          return item.title === albumTitle;
        });
        if (!album) {
          return;
        }
        renderAlbumDetail(album);
      });
    });
  };

  renderAlbumCards();

  if (detail) {
    var closeButton = detail.querySelector('.heo-mobile-album-detail-close');
    if (closeButton) {
      closeButton.onclick = closeAlbumDetail;
    }

    detail.onclick = function(event) {
      if (event.target === detail) {
        closeAlbumDetail();
      }
    };
  }

  if (searchInput) {
    searchInput.oninput = renderAlbumCards;
  }
};

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

//空格控制音乐
document.addEventListener("keydown", function (event) {
  var player = getPlayerInstance();

  if (!player) {
    return;
  }

  //暂停开启音乐
  if (event.code === "Space") {
    event.preventDefault();
    player.toggle();

  };
  //切换下一曲
  if (event.keyCode === 39) {
    event.preventDefault();
    player.skipForward();

  };
  //切换上一曲
  if (event.keyCode === 37) {
    event.preventDefault();
    player.skipBack();

  }
  //增加音量
  if (event.keyCode === 38) {
    if (volume <= 1) {
      volume += 0.1;
      player.volume(volume, true);

    }
  }
  //减小音量
  if (event.keyCode === 40) {
    if (volume >= 0) {
      volume += -0.1;
      player.volume(volume, true);

    }
  }
});

// 监听窗口大小变化
window.addEventListener('resize', function() {
  var player = getPlayerInstance();

  if (!player) {
    return;
  }

  if (window.innerWidth > 768) {
    player.list.show();
  } else {
    player.list.hide();
  }

});

// 调用初始化
heo.init();
