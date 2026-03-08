//Install
async function onInstalled(details) {
    let defaultStorage = {
        weather: {
            units: 'metric'
        },
        time: {
            units: 'metric',
            show: true
        },
        spotlight: {
            open: false
        },
        search: {
            show: true,
        },
        engine: {
            active: "bing"
        },
        mostVisited: {
            show: true
        },
        locationAuthorInfo: {
            show: true
        },
        attract: {
            videos: true,
            featuredVideos: true
        },
        videoSelectionType: 'random',
    }

    if (details.reason === "install") {
        //Create user
        var userID = uniqueID();
        defaultStorage.uuid = userID
        //Set InstallDate
        defaultStorage.installDate = Date.now()

        //Import offline videos
        chrome.storage.local.set({ videos: offlineStorage.videos.videos });
        chrome.storage.local.set({ videosFiles: offlineStorage.videos.videos });
        //Set first video as start video
        chrome.storage.local.set({ loadVideo: offlineStorage.videos.videos[0] });

        //Create storage
        var storage = defaultStorage
        chrome.storage.local.set({ storage: storage });

        //Get remote videos
        updateRemoteVideos();

        //Set Uninstall URL
        var uninstallURL = uninstallBaseURL + "?uuid=" + userID + '&version=' + extensionVersion;
        chrome.runtime.setUninstallURL(uninstallURL);

        //Action on install
        firstRun(details);
    } else {
        //Import existing videos
        let previousVideos = await getAllVideos();
        let previousVideosFiles = await getAllVideosFiles();

        // Remove unsupported video files
        const unsupportedVideoFiles = [
            "florence.MOV",
            "paris2.MOV",
            "hongkong.MOV",
            "london.MOV",
            "toscana.MOV",
            "bangkok.MOV"
        ];

        previousVideos = previousVideos.filter(vid => !unsupportedVideoFiles.includes(vid?.url))
        previousVideosFiles = previousVideosFiles.filter(vid => !unsupportedVideoFiles.includes(vid?.url))

        chrome.storage.local.set({ videos: previousVideos });
        chrome.storage.local.set({ videosFiles: previousVideosFiles || previousVideos });
        //Set first video as start video
        chrome.storage.local.set({ loadVideo: previousVideos[0] });

        //Create storage
        var storage = defaultStorage
        chrome.storage.local.set({ storage: storage });
    }
}

function firstRun(details) {
    //Send install event
    analyticsSendEvent('installed', extensionVersion)

    var newURL = installURL;
    chrome.tabs.create({ url: newURL });
}

function uniqueID() {
    var unique = '';
    var dict = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    for (var i = 0; i < 21; i++) {
        unique += dict.charAt(Math.floor(Math.random() * dict.length));
    }
    return unique;
}

//Init
async function initialize() {
    //First set background video
    currentVideo = await getLoadVideo();
    setBackgroundVideo(currentVideo);
    //Then all the rest
    //Set spotlight
    setSpotlight(currentVideo);
    //Set music
    setMusic(currentVideo);
    // Get storage 
    storage = await getStorage();
    // Set search
    setSearch(storage.storage.engine);
    //Proceed with initialization
    proceed();
}

async function proceed() {
    //Immediate
    analyticsSendEvent('newTab', extensionVersion)
    dateTime();
    setLocation();
    setSettings(storage);
    //Delayed
    setTimeout(() => {
        topSites()
        nextVideo();
    }, 1000);
    //Recurring
    setInterval(dateTime, 1000);
    //Initialize
    $('.button-music').popup();
    $('.button-promotions').popup();
    $('.button-videos').popup();
    $('.button-settings').popup();
    $('.button-feedback').popup();
    $('.button-donate').popup();
    $('.button-fullscreen').popup();
    $('.button-expand').popup();
    //Init tabs
    $('.menu .item').tab();
    //Attract
    // var attractVideosInterval = setInterval(async () => {
    //     var attractVideos = (await getStorageSetting('attract')).videos
    //     if (attractVideos) {
    //         $('.button-videos').transition('tada')
    //     } else {
    //         clearInterval(attractVideosInterval)
    //     }
    // }, 2000);

}

//Storage API
function getStorage() {
    return new Promise((resolve, reject) => {
        chrome.storage.local.get(["storage"], function (result) {
            resolve(result);
        });
    });
}

async function getStorageSetting(key) {
    return new Promise((resolve, reject) => {
        chrome.storage.local.get(["storage"], function (result) {
            resolve(result.storage[key]);
        });
    });
}

async function updateStorageSetting(key, data) {
    return new Promise(async (resolve, reject) => {
        //Get current storage
        var currentStorage = await getStorage();
        currentStorage = currentStorage.storage;
        //Update data
        currentStorage[key] = data;
        //Set new storage
        chrome.storage.local.set({ storage: currentStorage }, function (result) {
            resolve(true);
        });
    });
}

// Search
function setSearch(settings) {
    // Set feed
    searchBaseURL = searchEngines[settings.active].feed;
    // Set logo
    $(".search-icon").attr("src", searchEngines[settings.active].logo);

    // Set search engines
    // Set options
    $(".search-engines-select-list").html("")
    for (const engine in searchEngines) {
        const appendEngine = `<div class="item search-engine-option" data-slug="${engine}">${searchEngines[engine].title}</div>`;
        $(".search-engines-select-list").append(appendEngine);
    }

    // Init listeners
    $('.ui.dropdown')
        .dropdown()
        ;
    initEngineListeners()
}

//Videos
function getLoadVideo() {
    return new Promise(async (resolve, reject) => {
        chrome.storage.local.get(["loadVideo"], function (result) {
            resolve(result.loadVideo);
        });
    });
}

function setLoadVideo(video) {
    //Set first video as start video
    chrome.storage.local.set({ loadVideo: video });
}

function getAllVideos() {
    return new Promise(async (resolve, reject) => {
        chrome.storage.local.get(["videos"], function (result) {
            resolve(result.videos);
        });
    });
}

function getAllVideosFiles() {
    return new Promise(async (resolve, reject) => {
        chrome.storage.local.get(["videosFiles"], function (result) {
            resolve(result.videosFiles);
        });
    });
}

async function setVideoOptions() {
    $('.video-selection').html('');
    var allVideos = await getAllVideos();
    var videoSelectionType = await getStorageSetting("videoSelectionType");
    //Set video options
    allVideos.forEach(function (item, index) {
        if (currentVideo.id === item.id && videoSelectionType == 'one') {
            var thumbnail = '<div class="video-thumbnail-wrapper" data-id="' + item.id + '"><img class="ui large bordered image video-thumbnail selected" src="' + item.thumbnail + '"><p class="video-thumbnail-title selected">' + item.title + '</p><i class="fas fa-check video-thumbnail-check selected"></i></div>';
            $('.video-selection').prepend(thumbnail);
        } else {
            var thumbnail = '<div class="video-thumbnail-wrapper" data-id="' + item.id + '"><img class="ui large bordered image video-thumbnail" src="' + item.thumbnail + '"><p class="video-thumbnail-title">' + item.title + '</p><i class="fas fa-check video-thumbnail-check"></i><p class="video-thumbnail-delete" data-id="' + item.id + '"><i class="fas fa-times"></i></p></div>';
            $('.video-selection').append(thumbnail);
        }
    });
    initVideoThumbnailListener();

    //Add own video
    var addNewThumbnail = '<div class="video-thumbnail-wrapper add-own"><div class="ui large bordered image video-thumbnail"><i class="fas fa-upload add-own-icon"></i></div><p class="video-thumbnail-title selected">Add your own video</p><i class="fas fa-film video-thumbnail-check selected"></i></div>';
    $('.video-selection').prepend(addNewThumbnail);
    initAddOwnListener();
}

function thumbnailFromVideo(video) {
    let w = 320;
    let h = 180;
    let canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    let ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, w, h);
    let base64 = canvas.toDataURL('image/jpeg');
    return base64;
}

async function nextVideo() {
    var allVideosFiles = await getAllVideosFiles();
    var videoSelectionType = await getStorageSetting("videoSelectionType");

    //Select next video randomly
    if (videoSelectionType == 'random') {
        var videoToSet = getRandomVideo(allVideosFiles);

        while (videoToSet.id == currentVideo.id && allVideosFiles.length > 1) {
            videoToSet = getRandomVideo(allVideosFiles);
        }

        setLoadVideo(videoToSet);
    }
}

function getRandomVideo(allVideosFiles) {
    return allVideosFiles[getRandom(0, allVideosFiles.length - 1)];
}

function setBackgroundVideo(videoObject) {
    var video = videoObject.url;
    $('#backgroundVideo').attr('src', video)
    var video = document.getElementById('backgroundVideoWrapper');
    video.load();
    video.play();
    //Fade in content after video has loaded
    video.onloadeddata = function () {
        $('.container').css('background-color', 'transparent');
        /*
        //Correct video view
        var width = screen.width + 'px';
        var height = screen.height + 'px';
        $('#backgroundVideoWrapper').css('min-width', width)
        $('#backgroundVideoWrapper').css('min-height', height)
        console.log(width, height);
        */
    };
    var credits = chrome.i18n.getMessage("photoBy") + ' ' + videoObject.credits;
    $('.credits').html(credits);
}

function updateRemoteVideos() {
    return new Promise(async (resolve, reject) => {
        fetch(remoteVideoAPI)
            .then(response => response.json())
            .then(data => {
                console.log('Remote videos updated');
                chrome.storage.local.set({ remoteVideos: data });
                resolve(true)
            });
    });
}

async function getRemoteVideos() {
    return new Promise(async (resolve, reject) => {
        chrome.storage.local.get(["remoteVideos"], function (result) {
            resolve(result.remoteVideos);
        });
    });
}

async function setRemoteVideoOptions() {
    $('.browse-videos-selection').html('');

    var remoteVideos = await getRemoteVideos();
    var localVideos = await getAllVideos();

    remoteVideos.forEach(function (video, index) {
        var disableDownload = false;
        localVideos.forEach(function (localVideo, index) {
            if (video.id == localVideo.id) {
                disableDownload = true;
            }
        });

        if (!disableDownload) {
            var thumbnail = '<div class="remote-video-thumbnail-wrapper" data-id="' + video.id + '"><img class="ui large bordered image remote-video-thumbnail" src="' + video.acf.video.thumbnail + '"><p class="video-thumbnail-title selected">' + video.acf.title + '</p><i class="fas fa-download remote-video-thumbnail-download"></i></div>';
            $('.browse-videos-selection').append(thumbnail);
        } else {
            var thumbnail = '<div class="remote-video-thumbnail-wrapper downloaded" data-id="' + video.id + '"><img class="ui large bordered image remote-video-thumbnail downloaded" src="' + video.acf.video.thumbnail + '"><p class="video-thumbnail-title selected">' + video.acf.title + '</p><i class="fas fa-check-double remote-video-thumbnail-download"></i></div>';
            $('.browse-videos-selection').append(thumbnail);
        }
    })

    initRemoteVideoThumbnailListener();
}

async function videoURLtoBase64(videoURL) {
    return new Promise(async (resolve, reject) => {
        var xhr = new XMLHttpRequest(),
            blob,
            fileReader = new FileReader();

        xhr.open("GET", videoURL, true);
        // Set the responseType to arraybuffer. "blob" is an option too, rendering manual Blob creation unnecessary, but the support for "blob" is not widespread enough yet
        xhr.responseType = "arraybuffer";

        xhr.addEventListener("load", function () {
            if (xhr.status === 200) {
                // Create a blob from the response
                blob = new Blob([xhr.response], { type: "video/mp4" });

                // onload needed since Google Chrome doesn't support addEventListener for FileReader
                fileReader.onload = function (evt) {
                    // Read out file contents as a Data URL
                    var result = evt.target.result;
                    resolve(result);
                };
                // Load blob as Data URL
                fileReader.readAsDataURL(blob);
            }
        }, false);
        // Send XHR
        xhr.send();
    })
}

async function removeVideo(id) {
    id = parseInt(id)
    let allVideos = await getAllVideos();
    let allVideosFiles = await getAllVideosFiles();

    //Send analytics for removed video
    let removedVideo = allVideos.find(element => element.id == id)
    analyticsSendEvent('removedVideo', removedVideo.title)

    allVideos = allVideos.filter(e => e.id !== id)
    allVideosFiles = allVideosFiles.filter(e => e.id !== id)
    await chrome.storage.local.set({ videos: allVideos });
    await chrome.storage.local.set({ videosFiles: allVideosFiles });
    //Refresh options
    setBackgroundVideo(allVideosFiles[0])
    nextVideo();
    setVideoOptions();
    setRemoteVideoOptions();
    loaderVideo('hide')
}

//Spotlight
function setSpotlight(videoObject) {
    //Get data
    var factIndex = getRandom(0, videoObject.facts.length - 1);
    var fact = videoObject.facts[factIndex];

    var lat = videoObject.lat;
    var long = videoObject.long;

    //Strip old data
    $('.button-expand').css('visibility', 'hidden');

    //Set new title
    $('.spotlight .title').html(videoObject.title);

    //Set new coordinates
    if (lat && long) {
        $('.button-map-trigger').attr('data-lat', lat);
        $('.button-map-trigger').attr('data-long', long);
        $('.button-map-trigger').attr('data-title', videoObject.title);
        $('.button-map-trigger').removeClass('hide');
    }

    //If available, set new fact
    if (fact) {
        $('.spotlight .description').html(fact);
        $('.button-expand').css('visibility', 'visible');
    }
}

//Music
function setMusic(videoObject) {
    if (!videoObject.music) { return; }
    //Get data
    var trackIndex = getRandom(0, videoObject.music.length - 1);
    var track = videoObject.music[trackIndex];

    //Strip old data
    $('.button-music').css('display', 'none');

    //Set new title
    $('.button-music').attr('data-link', track);

    //If available, set new fact
    if (track) {
        $('.button-music').css('display', 'inline-block');
    }
}

//Favorites
function favorites() {
    //Init tabs
    $('.menu .item').tab();
    //Init tab content
    //topSites();
    //bookmarks();
    //history(0);
}

function topSites() {
    //Set Most visited websites
    chrome.topSites.get(async function (result) {
        var topSitesAppend = '';
        var topSitesBackup = '';
        var mostVisitedAppend = '';
        let sidebarTilesAppend = ''
        result.forEach(function (item, index) {
            topSitesAppend += createFavoriteItem(item, 'topsite');
            if (index < 4) {
                mostVisitedAppend += createMostVisitedItem(item, 'mostvisited');
            } else if (index == 4) {
                topSitesBackup += createMostVisitedItem(item, 'mostvisited');
            }
        })

        //Add Promotions
        let location = await getStorageSetting('location')
        if (!location) {
            setTimeout(() => {
                topSites()
                return;
            }, 1000);
        }

        // Add bottom tiles
        let promotionsURL = bottomTilesURLbase
        let promotions = await getResponse(promotionsURL)

        if (promotions.tiles && promotions.tiles.length > 0) {
            //Assign promotions
            promotions = promotions.tiles
            //Add to most visited
            mostVisitedAppend += createPromotionTile(promotions[0])
            promotions.length > 1 && (mostVisitedAppend += createPromotionTile(promotions[1]))
        } else {
            promotions = []
            mostVisitedAppend += topSitesBackup
        }

        $('.top-sites-list').html(topSitesAppend);
        initTopSiteListener();

        // Add sidebar tiles
        let sidebarPromotionsURL = sidebarTilesURLbase
        let sidebarPromotions = await getResponse(sidebarPromotionsURL)

        //Add promotions to sidebar
        if (sidebarPromotions.tiles && sidebarPromotions.tiles.length > 0) {
            sidebarPromotions = sidebarPromotions.tiles
        }

        sidebarPromotions.forEach(p => {
            sidebarTilesAppend += createPromotionTile(p)
        });

        
        $('.most-visited').html(mostVisitedAppend)

        if (storage.storage.mostVisited.show) {
            $('.most-visited').css('opacity', 1)
        }
        if (sidebarTilesAppend) {
            $('.sidebar-promotions-list').html(sidebarTilesAppend)
        }

        initPromotionsListener();
    })
}

/*
function bookmarks() {
    //Set bookmarked websites
    chrome.bookmarks.getTree(function (result) {
        var allBookmarks = result;
        var allBookmarksSearch = [];
        var bookmarksBar = allBookmarks[0].children[0].children;
        var bookmarksAppend = '';

        bookmarksBar.forEach(function (item, index) {
            if (item.children) { return; }
            //Create element
            bookmarksAppend += createFavoriteItem(item, 'bookmark');
            //Push to search array
            allBookmarksSearch.push({ title: item.title, url: item.url });

        })

        $('.bookmarks-list').html(bookmarksAppend);
        $('.bookmark-search').search({
            source: allBookmarksSearch,
            onSelect: function () {
                loader('show');
            }
        });

        initBookmarkListener();
    })
}
*/

function createFavoriteItem(item, className) {
    var toReturn = '<div class="item ' + className + '" data-url="' + item.url + '" title="' + item.title + '">';
    toReturn += '<a href="' + item.url + '">';
    toReturn += '<img class="' + className + '-icon" src="http://www.google.com/s2/favicons?domain=' + item.url + '" />';
    toReturn += '<div class="content ' + className + '-content">';
    toReturn += '<div class="header ' + className + '-header">' + item.title + '</div>';
    toReturn += '<div class="' + className + '-description">' + item.url + '</div>';
    toReturn += '</div>';
    toReturn += '</a>';
    toReturn += '</div>';
    return toReturn;
}

function createMostVisitedItem(item, className) {
    let shortTitle = item.title.substring(0, 10)
    if (item.title.length > 20) { shortTitle += '...' }
    var toReturn = '<div class="item ' + className + '" data-url="' + item.url + '" title="' + item.title + '">';
    toReturn += '<a href="' + item.url + '">';
    toReturn += '<img class="' + className + '-icon" src="http://www.google.com/s2/favicons?domain=' + item.url + '" />';
    toReturn += '<div class="content ' + className + '-content">';
    toReturn += '<div class="header ' + className + '-header" title="' + item.title + '">' + shortTitle + '</div>';
    //toReturn += '<div class="' + className + '-description">' + item.url + '</div>';
    toReturn += '</div>';
    toReturn += '</a>';
    toReturn += '</div>';
    return toReturn;
}

function createPromotionTile(item) {
    var toReturn = ''
    toReturn += '<div class="item mostvisited promoted" data-url="' + item.click_url + '" title="' + item.name + '">';
    toReturn += '<i class="fas fa-star mostvisited-promoted-icon"></i>'
    toReturn += '<a href="' + item.click_url + '"><img class="mostvisited-icon" src="' + item.image_url + '"><img class="mostvisited-impression" src="' + item.impression_url + '">'
    toReturn += '<div class="content mostvisited-content"><div class="header mostvisited-header">'
    toReturn += item.name
    toReturn += '</div></div></a></div>'

    return toReturn
}

/*
async function history(offset) {
    var initHistory = await getHistory(offset);
    var historyAppend = '';

    initHistory.forEach(function (item, index) {
        //Create element
        historyAppend += createFavoriteItem(item, 'history');
    });

    historyAppend += '<div class="history-load-more-wrapper"><button class="ui primary button history-load-more" data-offset="' + (offset + 100) + '">Open History</button></div>';

    $('.history-list').append(historyAppend);
    initHistoryListener();
    initHistoryLoadListener()
}

function getHistory(offset) {
    return new Promise(async (resolve, reject) => {
        var toReturn = [];
        chrome.history.search({ text: '', maxResults: offset + 100 }, function (data) {
            data.forEach(function (page, index) {
                if (index < offset) {
                    //Skip
                } else {
                    toReturn.push(page);
                }
            });

            resolve(toReturn);
        });
    });
}
*/

//Search
function fireSearch(query) {
    loader('show');
    const queryLink = formatSearchLink(query)
    analyticsSendEvent('search', query)
    window.location.href = queryLink;
}
function formatSearchLink(query) {
    var baseURL = searchBaseURL;
    var redirectURL = baseURL + query;
    return redirectURL
}

async function getSearchSuggestions(query) {
    // Format suggestions URLs
    let suggestionsURL = searchSuggestAPIBase + query

    // Get all suggestions
    const allData = await Promise.allSettled([getResponse(suggestionsURL)])

    // Format data
    let suggestions = []

    //// Add search suggestions
    if (allData[0].status === 'fulfilled') {
        allData[0].value[1] && suggestions.push(...allData[0].value[1])
    }

    $('.search-suggestions').html('')
    let newSuggestions = ''
    suggestions.forEach((sug, index) => {
        if (index > 8) { return false }
        // Create all other suggestions
        newSuggestions += '<a href="' + formatSearchLink(sug) + '" class="suggestion suggestion-regular">' + sug + '</a>'
    });
    $('.search-suggestions').html(newSuggestions)
    $('.search-suggestions').css('display', 'block !important')
    $('.search-suggestions').css('opacity', '1 !important')

    initSuggestionListener()
}

//Time
async function switchTimeFormat(format) {
    var timeSetting = { units: format, show: true };
    await updateStorageSetting("time", timeSetting);
    dateTime();
}

async function dateTime() {
    var timeSettings = await getStorageSetting("time");
    var timeUnits = timeSettings.units;
    //Init
    var time = '';
    var date = new Date(),
        locale = "en-us";
    var hours = date.getHours();
    var minutes = date.getMinutes();
    if (minutes < 10) {
        minutes = "0" + minutes;
    }
    //Format
    if (timeUnits == 'metric') {
        time = hours + ":" + minutes;
    } else {
        var ampm = hours >= 12 ? 'PM' : 'AM';
        ampm = '<span class="time-ampm">' + ampm + '</span>';
        var hours = hours % 12;
        var hours = hours ? hours : 12; // the hour '0' should be '12'
        time = hours + ":" + minutes + ampm;
    }
    //Show
    $(".time").html(time);
}

//Location
function setLocation() {
    $.getJSON("https://json.geoiplookup.io/", function (data) {
        var currentLocation = data.city + ', ' + data.country_name;
        $('.location').html(currentLocation);
        $('.location').css({ 'visibility': 'visible', "max-height": '100px' })
        updateStorageSetting('location', data)
    });
}

//Settings
function setSettings(storage) {
    let settings = storage.storage
    //Setup sidebar switches
    if (settings.search.show) {
        $('.search-input').css('opacity', 0.4)
        $('.search-autofocus-mini').css('opacity', 1)
    } else {
        $('.switch-search').removeAttr('checked')
        $('.search-input').css('display', 'none')
        $('.search-autofocus-mini').css('opacity', 0)
    }
    if (settings.mostVisited.show) {
        //$('.most-visited').css('opacity', 1)
    } else {
        $('.switch-most-visited').removeAttr('checked')
    }
    if (settings.locationAuthorInfo.show) {
        $('.location').css('opacity', 1)
        $('.credits').css('opacity', 0.8)
    } else {
        $('.switch-location-author-info').removeAttr('checked')
    }
    if (settings.time.show) {
        $('.time').css('opacity', 1)
    } else {
        $('.switch-time').removeAttr('checked')
    }
}

//Analytics
async function analyticsSendEvent(type, action) {
    //console.log(type, action);
    //Get UUID from storage
    var storageUUID = await getStorageSetting("uuid");
    //Get InstallDate from storage
    var installDate = await getStorageSetting("installDate");

    var trackingID = googleAnalyticsID;
    var uuid = storageUUID;
    var campaignName = extensionName + ' ' + extensionVersion;
    var campaignSource = extensionName;
    var campaignMedium = installDate;
    var eventType = type;
    var eventAction = action;
    if (eventAction == "") {
        eventAction = "none";
    }

    var urlBase = "https://www.google-analytics.com/collect";
    var urlParams =
        "?v=1&t=event&tid=" +
        trackingID +
        "&cid=" +
        uuid +
        "&cn=" +
        campaignName +
        "&cs=" +
        campaignSource +
        "&cm=" +
        campaignMedium +
        "&ec=" +
        eventType +
        "&ea=" +
        eventAction;
    var analyticsURL = urlBase + urlParams;

    const sentRequest = await fetch(analyticsURL)
}

//Translate
function translate() {
    $('.translate').each(function () {
        var selector = $(this).attr('data-translate');
        var originalText = $(this).html();

        var translation = chrome.i18n.getMessage(selector);

        $(this).html(translation);
    });
}

//Loader - Dimmer
function loader(option) {
    $('.page.dimmer.general').dimmer(option);
}

function loaderVideo(option) {
    $('.page.dimmer.video-loader').dimmer(option);
}

//Auxiliary
function getRandom(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getResponse(url) {
    return new Promise(async (resolve, reject) => {
        $.getJSON(url, function (data) {
            resolve(data)
        }).fail(() => {
            resolve([])
        });
    })
}

const debounce = (func, wait) => {
    let timeout;

    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };

        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
};