// ezpz copypasta expression that tells me if an element is off-screen. This is helpful
// in removing elements that are offscreen
jQuery.expr.filters.offscreen = function(el) {
    var rect = el.getBoundingClientRect();

    return (rect.x + rect.width) < 0 
               || (rect.y + rect.height) < 0
               || (rect.x > window.innerWidth || rect.y > window.innerHeight + 1000); // added a 1000 px buffer so that if comments are removed, some of the messages off frame can side back down
  };
  
  var blacklistUsers = [];
  var whitelistUsers = [];
  
  // holds a reference to the message ids and their corresponding timeouts
  const inFlightMessages = {};
  
  // if a user doesn't have a provided display color. we make one up and store the link in this dictionary!
  const colorlessUsers = {};
  
  // sidebar field data with settings
  var fieldData;
  
  window.addEventListener('onWidgetLoad', function (obj) {
    fieldData = obj.detail.fieldData;
    
    // set up list of whiteout users or blackout users
    if (fieldData.blacklistUsers && fieldData.blacklistUsers.length)
        blacklistUsers = fieldData.blacklistUsers.split(',').map(username => username.trim().toLowerCase());
    if (fieldData.whitelistUsers && fieldData.whitelistUsers.length)
        whitelistUsers = fieldData.whitelistUsers.split(',').map(username => username.trim().toLowerCase());
  });
  
  window.addEventListener('onEventReceived', function (obj) {
    
    const data = obj.detail.event;
  
    if (obj.detail.listener === 'delete-messages') {
      deleteUserMessages(data.userId);
      return;
    }
    
    if (obj.detail.listener === 'delete-message') {
      deleteUserMessage(data.msgId);
      return;
    }
    
    console.log(obj);
    if (obj.detail.listener !== "message" && obj.detail.event.field !== "testButton") return;
    
  
    let messageData = data.data;
    
    // If the "TEST MESSAGE" button is clicked, you can view a simulated message. To see the objects 
    // that are used for the simulated ovjects, refer to the data at the bottom of this text file
    if (obj.detail.listener === 'event:test') {
      messageData = testMessages[ Math.floor(Math.random() * testMessages.length)];
    }
  
    // exit early if the message sender happens to be on the blacklist or NOT on the whitelist
    if (blacklistUsers && blacklistUsers.length && blacklistUsers.includes(messageData.displayName.toLowerCase())) return;
    if (whitelistUsers && whitelistUsers.length && !whitelistUsers.includes(messageData.displayName.toLowerCase())) return;
    
    // exit early if this is a chatbot command and we want to ignore it.
    if (fieldData.filterCommands && messageData.text.match(/^!\w*/)) return;
    
    // generate the badge part of the message
    let badgeTemplate = "";
    if (messageData.badges && messageData.badges.length > 0) {
      messageData.badges.forEach(badge => {
          badgeTemplate += `<img src="${badge.url}">`
      })
    }
    
    // generate the message part of the message
    let messageTemplate = $('<div />').text(messageData.text).html();
    if (messageData.emotes && messageData.emotes.length > 0) {
      messageData.emotes.forEach(emote => {
        messageTemplate = messageTemplate.replace(emote.name, "<span class='emote'><img  src='" + emote.urls["2"] + "'></span>");
      });
    }
    
    // if is an action (starts message with '/me') make text same color as username
    if (messageData.isAction) {
      messageTemplate = `<span style="${generateTextColorStyleString(messageData.displayColor, fieldData.textColorTransform, messageData.displayName)}"><em>${messageTemplate}</em></span>`
    }
  
    // generate and apply animation classes for message entering chat window
    let animationMessages = generateClassName(fieldData.newMessageAnimation, fieldData.newMessageAnimationDirection);
    if (animationMessages) {
      animationMessages = 'animate__animated ' + animationMessages;
    }
    
    // compile username area
    var usernameTemplate = `    <span class="usernameContainer ${fieldData.sideBySide === "true" ? 'sideBySideUsername' : ''}">
        <span class="badges">${badgeTemplate}</span>
        <span class="userName" style="${generateTextColorStyleString(messageData.displayColor, fieldData.textColorTransform, messageData.displayName)}">${messageData.displayName }</span>${messageData.isAction ? '' : ':'}
      </span>`
    
    let inlineStyle = ''
    if (fieldData.enableDropshadow === "true") {
      inlineStyle = `style="filter: drop-shadow(-3px 3px 3px #000000);"`
    }
    
    // compile the whole message
    var message = "";
    if (fieldData.sideBySide === "true") {
      message = `    
    <div class="chatMessage flexRow ${animationMessages}" id="id${messageData.msgId}" ${inlineStyle}>
      ${usernameTemplate}
      <div class="message sideBySideMessage longWordWrap" >${messageTemplate}</div>
    </div>`
    } else {
      message = `    
    <div class="chatMessage longWordWrap ${animationMessages}" id="id${messageData.msgId}" ${inlineStyle}>
      <div class="message">${usernameTemplate}${messageTemplate}</div>
    </div>`
    }
    
    // create a dom reference of the generated message
    let domMessage = $(message);
  
    // add message to beginning of list
    $(".chatContainer").prepend(domMessage);
    if (fieldData.duration > 0) {
      inFlightMessages[messageData.msgId] = {timeoutId: setTimeout(removeDomMessage(domMessage), fieldData.duration * 1000),
                                     userId: messageData.userId};
    } else {
      inFlightMessages[messageData.msgId] = {timeoutId: null, userId: messageData.userId};
    }
    
    // clear any messages that are significantly off-screen.
    // I leave a bit of a buffer in the event that a mod deletes a message, 
    // which will aid in replacing deleted messages with some older ones

    $(".isReady:offscreen").each((_, element) => {
      let id = extractId(element.id);
      clearTimeout(inFlightMessages[id])
      delete inFlightMessages[id];
    })
    $(".isReady:offscreen").remove();
    
    if (fieldData.newAnimationSpeed) {
      setTimeout(markForReady(domMessage), fieldData.newAnimationSpeed * 1000);
    } else {
      markForReady(domMessage);
    }
    
    if (fieldData.messageLimit && $(".chatMessage").not(".isRemoving").length > fieldData.messageLimit) {
	  let messageToRemove = $(".chatMessage").not(".isRemoving").last();
      let inFlightMessageId = extractId(messageToRemove[0].id);
      clearTimeout(inFlightMessages[inFlightMessageId]);
      delete inFlightMessages[inFlightMessageId];
      removeDomMessage(messageToRemove)();
    }
    
    
  });
  
  // apply the isReady class. We look for this class when checking if a message is 
  // off screen because some animations start from off-screen
  function markForReady(domMessage) {
    return function() {
      domMessage.addClass('isReady');
    }
  }
  
  // remove a message from the dom. If there are animations to run, run them first
  function removeDomMessage(domMessage) {
    return function() { 
      // remove animation intro, if exists
      if (fieldData.newMessageAnimation && fieldData.newMessageAnimation != "none") {
        let classToRemove = generateClassName(fieldData.newMessageAnimation, fieldData.newMessageAnimationDirection)
        domMessage.removeClass(classToRemove)
      }
      
      // add outro animation, if exists
      if (fieldData.oldMessageAnimation && fieldData.oldMessageAnimation != "none") {
        if (!domMessage.hasClass("animate__animated")) {
          domMessage.addClass("animate__animated");
        }
        
        let classToAdd = generateClassName(fieldData.oldMessageAnimation, fieldData.oldMessageAnimationDirection)
        domMessage.addClass("isRemoving");
        domMessage.addClass(classToAdd);
        setTimeout(() => {
          domMessage.remove();
        }, fieldData.oldAnimationSpeed * 1000)
      } else {
        domMessage.remove();
      }   
    }
  }
  function deleteUserMessages(userId) {
    for (const [key, value] of Object.entries(inFlightMessages)) {
      if (value.userId === userId) {
        let domMessage = $('#id' + key);
        domMessage.remove();
        clearTimeout(value.timeoutId);
        delete inFlightMessages[key];
      }
    }
  }

  function deleteUserMessage(msgId) {
    if (!inFlightMessages[msgId]) return;
    
    let domMessage = $('#id' + msgId);
    domMessage.remove();
    clearTimeout(inFlightMessages[msgId].timeoutId);
    delete inFlightMessages[msgId];
  }
  
  // generate the class name to be used for styling animations
  function generateClassName(animationName, animationDirection) {
    let className = "";
    if (animationName && animationName != "none") { // make sure to skip if animations arent wanted
      className = "animate__" + animationName;
      if (animationDirection && animationDirection != "none") {
        className += animationDirection;
      }
    }
    return className;
  }

  function extractId(domId) {
    return domId.slice(2);
  }
  
  // generate the text color. If we want to brighten or darken the text color, we apply a filter too
  function generateTextColorStyleString(color, transform, username) {
    let returnStyle = '';
    let tempColor = '';

    if (!color && !colorlessUsers[username]) {
      tempColor = '#' + Math.floor(Math.random()*16777215).toString(16);
      colorlessUsers[username] = tempColor;
    } else if (!color) {
      tempColor = colorlessUsers[username]
    } else {
      tempColor = color;
    }
      
    returnStyle = `color: ${tempColor};`;
    
    
  
    // if we're brightening AND the color is dark, brighten
    if (transform == 'brighten' && !isColorLight(tempColor)) {
      returnStyle += ` filter: brightness(175%);`;
    } 
    // if we're darkening AND the color is bright, darken.
    if (transform == 'darken' && isColorLight(tempColor)) {
      returnStyle += ` filter: brightness(80%);`;
     }
    return returnStyle;
  }
  
  // a copy-pasted function. Compute if a color is 'light' or 'dark'
  function isColorLight(color) {
      const hex = color.replace('#', '');
      const c_r = parseInt(hex.substr(0, 2), 16);
      const c_g = parseInt(hex.substr(2, 2), 16);
      const c_b = parseInt(hex.substr(4, 2), 16);
      const brightness = ((c_r * 299) + (c_g * 587) + (c_b * 114)) / 1000;
      return brightness > 155;
  }
  
  const testMessages = [
    {
      "nick": "aaroniush",
      "userId": "43658519",
      "displayName": "AaroniusH",
      "displayColor": "#7A0D82",
      "badges": [
          {
              "type": "broadcaster",
              "version": "1",
              "url": "https://static-cdn.jtvnw.net/badges/v1/5527c58c-fb7d-422d-b71b-f309dcb85cc1/3",
              "description": "Broadcaster"
          },
          {
              "type": "subscriber",
              "version": "3012",
              "url": "https://static-cdn.jtvnw.net/badges/v1/1cd74dc7-59a8-407a-929b-f90c2c745d3c/3",
              "description": "1-Year Subscriber"
          }
      ],
      "channel": "aaroniush",
      "text": "Howdy! It's me! AaroniusH :D I hope this message finds you well in making your chat widget a success. Here's a generic emote SourPls",
      "isAction": false,
      "emotes": [
          {
              "type": "twitch",
              "name": ":D",
              "id": "443",
              "gif": false,
              "urls": {
                  "1": "https://static-cdn.jtvnw.net/emoticons/v1/443/1.0",
                  "2": "https://static-cdn.jtvnw.net/emoticons/v1/443/1.0",
                  "4": "https://static-cdn.jtvnw.net/emoticons/v1/443/3.0"
              },
              "start": 25,
              "end": 26
          },
          {
              "type": "bttv",
              "name": "SourPls",
              "id": "566ca38765dbbdab32ec0560",
              "gif": true,
              "urls": {
                  "1": "https://cdn.betterttv.net/emote/566ca38765dbbdab32ec0560/1x",
                  "2": "https://cdn.betterttv.net/emote/566ca38765dbbdab32ec0560/2x",
                  "4": "https://cdn.betterttv.net/emote/566ca38765dbbdab32ec0560/3x"
              },
              "start": 124,
              "end": 131
          }
      ],
      "msgId": "c94f5b24-c23e-4651-8561-2980acca9989"
  },
    {
      "nick": "aaroniush",
      "userId": "43658519",
      "displayName": "Frankie",
      "displayColor": "#A0C1B9",
      "badges": [
          {
              "type": "subscriber",
              "version": "3012",
              "url": "https://static-cdn.jtvnw.net/badges/v1/1cd74dc7-59a8-407a-929b-f90c2c745d3c/3",
              "description": "1-Year Subscriber"
          }
      ],
      "channel": "aaroniush",
      "text": "LUL LUL LUL LUL LUL LUL LUL LUL LUL LUL LUL LUL LUL LUL LUL LUL LUL LUL LUL LUL LUL LUL LUL LUL LUL LUL LUL LUL LUL LUL LUL LUL LUL LUL LUL LUL LUL",
      "isAction": false,
      "emotes": [
          {
              "type": "twitch",
              "name": "LUL",
              "id": "425618",
              "gif": false,
              "urls": {
                  "1": "https://static-cdn.jtvnw.net/emoticons/v1/425618/1.0",
                  "2": "https://static-cdn.jtvnw.net/emoticons/v1/425618/1.0",
                  "4": "https://static-cdn.jtvnw.net/emoticons/v1/425618/3.0"
              },
              "start": 0,
              "end": 2
          },
          {
              "type": "twitch",
              "name": "LUL",
              "id": "425618",
              "gif": false,
              "urls": {
                  "1": "https://static-cdn.jtvnw.net/emoticons/v1/425618/1.0",
                  "2": "https://static-cdn.jtvnw.net/emoticons/v1/425618/1.0",
                  "4": "https://static-cdn.jtvnw.net/emoticons/v1/425618/3.0"
              },
              "start": 4,
              "end": 6
          },
          {
              "type": "twitch",
              "name": "LUL",
              "id": "425618",
              "gif": false,
              "urls": {
                  "1": "https://static-cdn.jtvnw.net/emoticons/v1/425618/1.0",
                  "2": "https://static-cdn.jtvnw.net/emoticons/v1/425618/1.0",
                  "4": "https://static-cdn.jtvnw.net/emoticons/v1/425618/3.0"
              },
              "start": 8,
              "end": 10
          },
          {
              "type": "twitch",
              "name": "LUL",
              "id": "425618",
              "gif": false,
              "urls": {
                  "1": "https://static-cdn.jtvnw.net/emoticons/v1/425618/1.0",
                  "2": "https://static-cdn.jtvnw.net/emoticons/v1/425618/1.0",
                  "4": "https://static-cdn.jtvnw.net/emoticons/v1/425618/3.0"
              },
              "start": 12,
              "end": 14
          },
          {
              "type": "twitch",
              "name": "LUL",
              "id": "425618",
              "gif": false,
              "urls": {
                  "1": "https://static-cdn.jtvnw.net/emoticons/v1/425618/1.0",
                  "2": "https://static-cdn.jtvnw.net/emoticons/v1/425618/1.0",
                  "4": "https://static-cdn.jtvnw.net/emoticons/v1/425618/3.0"
              },
              "start": 16,
              "end": 18
          },
          {
              "type": "twitch",
              "name": "LUL",
              "id": "425618",
              "gif": false,
              "urls": {
                  "1": "https://static-cdn.jtvnw.net/emoticons/v1/425618/1.0",
                  "2": "https://static-cdn.jtvnw.net/emoticons/v1/425618/1.0",
                  "4": "https://static-cdn.jtvnw.net/emoticons/v1/425618/3.0"
              },
              "start": 20,
              "end": 22
          },
          {
              "type": "twitch",
              "name": "LUL",
              "id": "425618",
              "gif": false,
              "urls": {
                  "1": "https://static-cdn.jtvnw.net/emoticons/v1/425618/1.0",
                  "2": "https://static-cdn.jtvnw.net/emoticons/v1/425618/1.0",
                  "4": "https://static-cdn.jtvnw.net/emoticons/v1/425618/3.0"
              },
              "start": 24,
              "end": 26
          },
          {
              "type": "twitch",
              "name": "LUL",
              "id": "425618",
              "gif": false,
              "urls": {
                  "1": "https://static-cdn.jtvnw.net/emoticons/v1/425618/1.0",
                  "2": "https://static-cdn.jtvnw.net/emoticons/v1/425618/1.0",
                  "4": "https://static-cdn.jtvnw.net/emoticons/v1/425618/3.0"
              },
              "start": 28,
              "end": 30
          },
          {
              "type": "twitch",
              "name": "LUL",
              "id": "425618",
              "gif": false,
              "urls": {
                  "1": "https://static-cdn.jtvnw.net/emoticons/v1/425618/1.0",
                  "2": "https://static-cdn.jtvnw.net/emoticons/v1/425618/1.0",
                  "4": "https://static-cdn.jtvnw.net/emoticons/v1/425618/3.0"
              },
              "start": 32,
              "end": 34
          },
          {
              "type": "twitch",
              "name": "LUL",
              "id": "425618",
              "gif": false,
              "urls": {
                  "1": "https://static-cdn.jtvnw.net/emoticons/v1/425618/1.0",
                  "2": "https://static-cdn.jtvnw.net/emoticons/v1/425618/1.0",
                  "4": "https://static-cdn.jtvnw.net/emoticons/v1/425618/3.0"
              },
              "start": 36,
              "end": 38
          },
          {
              "type": "twitch",
              "name": "LUL",
              "id": "425618",
              "gif": false,
              "urls": {
                  "1": "https://static-cdn.jtvnw.net/emoticons/v1/425618/1.0",
                  "2": "https://static-cdn.jtvnw.net/emoticons/v1/425618/1.0",
                  "4": "https://static-cdn.jtvnw.net/emoticons/v1/425618/3.0"
              },
              "start": 40,
              "end": 42
          },
          {
              "type": "twitch",
              "name": "LUL",
              "id": "425618",
              "gif": false,
              "urls": {
                  "1": "https://static-cdn.jtvnw.net/emoticons/v1/425618/1.0",
                  "2": "https://static-cdn.jtvnw.net/emoticons/v1/425618/1.0",
                  "4": "https://static-cdn.jtvnw.net/emoticons/v1/425618/3.0"
              },
              "start": 44,
              "end": 46
          },
          {
              "type": "twitch",
              "name": "LUL",
              "id": "425618",
              "gif": false,
              "urls": {
                  "1": "https://static-cdn.jtvnw.net/emoticons/v1/425618/1.0",
                  "2": "https://static-cdn.jtvnw.net/emoticons/v1/425618/1.0",
                  "4": "https://static-cdn.jtvnw.net/emoticons/v1/425618/3.0"
              },
              "start": 48,
              "end": 50
          },
          {
              "type": "twitch",
              "name": "LUL",
              "id": "425618",
              "gif": false,
              "urls": {
                  "1": "https://static-cdn.jtvnw.net/emoticons/v1/425618/1.0",
                  "2": "https://static-cdn.jtvnw.net/emoticons/v1/425618/1.0",
                  "4": "https://static-cdn.jtvnw.net/emoticons/v1/425618/3.0"
              },
              "start": 52,
              "end": 54
          },
          {
              "type": "twitch",
              "name": "LUL",
              "id": "425618",
              "gif": false,
              "urls": {
                  "1": "https://static-cdn.jtvnw.net/emoticons/v1/425618/1.0",
                  "2": "https://static-cdn.jtvnw.net/emoticons/v1/425618/1.0",
                  "4": "https://static-cdn.jtvnw.net/emoticons/v1/425618/3.0"
              },
              "start": 56,
              "end": 58
          },
          {
              "type": "twitch",
              "name": "LUL",
              "id": "425618",
              "gif": false,
              "urls": {
                  "1": "https://static-cdn.jtvnw.net/emoticons/v1/425618/1.0",
                  "2": "https://static-cdn.jtvnw.net/emoticons/v1/425618/1.0",
                  "4": "https://static-cdn.jtvnw.net/emoticons/v1/425618/3.0"
              },
              "start": 60,
              "end": 62
          },
          {
              "type": "twitch",
              "name": "LUL",
              "id": "425618",
              "gif": false,
              "urls": {
                  "1": "https://static-cdn.jtvnw.net/emoticons/v1/425618/1.0",
                  "2": "https://static-cdn.jtvnw.net/emoticons/v1/425618/1.0",
                  "4": "https://static-cdn.jtvnw.net/emoticons/v1/425618/3.0"
              },
              "start": 64,
              "end": 66
          },
          {
              "type": "twitch",
              "name": "LUL",
              "id": "425618",
              "gif": false,
              "urls": {
                  "1": "https://static-cdn.jtvnw.net/emoticons/v1/425618/1.0",
                  "2": "https://static-cdn.jtvnw.net/emoticons/v1/425618/1.0",
                  "4": "https://static-cdn.jtvnw.net/emoticons/v1/425618/3.0"
              },
              "start": 68,
              "end": 70
          },
          {
              "type": "twitch",
              "name": "LUL",
              "id": "425618",
              "gif": false,
              "urls": {
                  "1": "https://static-cdn.jtvnw.net/emoticons/v1/425618/1.0",
                  "2": "https://static-cdn.jtvnw.net/emoticons/v1/425618/1.0",
                  "4": "https://static-cdn.jtvnw.net/emoticons/v1/425618/3.0"
              },
              "start": 72,
              "end": 74
          },
          {
              "type": "twitch",
              "name": "LUL",
              "id": "425618",
              "gif": false,
              "urls": {
                  "1": "https://static-cdn.jtvnw.net/emoticons/v1/425618/1.0",
                  "2": "https://static-cdn.jtvnw.net/emoticons/v1/425618/1.0",
                  "4": "https://static-cdn.jtvnw.net/emoticons/v1/425618/3.0"
              },
              "start": 76,
              "end": 78
          },
          {
              "type": "twitch",
              "name": "LUL",
              "id": "425618",
              "gif": false,
              "urls": {
                  "1": "https://static-cdn.jtvnw.net/emoticons/v1/425618/1.0",
                  "2": "https://static-cdn.jtvnw.net/emoticons/v1/425618/1.0",
                  "4": "https://static-cdn.jtvnw.net/emoticons/v1/425618/3.0"
              },
              "start": 80,
              "end": 82
          },
          {
              "type": "twitch",
              "name": "LUL",
              "id": "425618",
              "gif": false,
              "urls": {
                  "1": "https://static-cdn.jtvnw.net/emoticons/v1/425618/1.0",
                  "2": "https://static-cdn.jtvnw.net/emoticons/v1/425618/1.0",
                  "4": "https://static-cdn.jtvnw.net/emoticons/v1/425618/3.0"
              },
              "start": 84,
              "end": 86
          },
          {
              "type": "twitch",
              "name": "LUL",
              "id": "425618",
              "gif": false,
              "urls": {
                  "1": "https://static-cdn.jtvnw.net/emoticons/v1/425618/1.0",
                  "2": "https://static-cdn.jtvnw.net/emoticons/v1/425618/1.0",
                  "4": "https://static-cdn.jtvnw.net/emoticons/v1/425618/3.0"
              },
              "start": 88,
              "end": 90
          },
          {
              "type": "twitch",
              "name": "LUL",
              "id": "425618",
              "gif": false,
              "urls": {
                  "1": "https://static-cdn.jtvnw.net/emoticons/v1/425618/1.0",
                  "2": "https://static-cdn.jtvnw.net/emoticons/v1/425618/1.0",
                  "4": "https://static-cdn.jtvnw.net/emoticons/v1/425618/3.0"
              },
              "start": 92,
              "end": 94
          },
          {
              "type": "twitch",
              "name": "LUL",
              "id": "425618",
              "gif": false,
              "urls": {
                  "1": "https://static-cdn.jtvnw.net/emoticons/v1/425618/1.0",
                  "2": "https://static-cdn.jtvnw.net/emoticons/v1/425618/1.0",
                  "4": "https://static-cdn.jtvnw.net/emoticons/v1/425618/3.0"
              },
              "start": 96,
              "end": 98
          },
          {
              "type": "twitch",
              "name": "LUL",
              "id": "425618",
              "gif": false,
              "urls": {
                  "1": "https://static-cdn.jtvnw.net/emoticons/v1/425618/1.0",
                  "2": "https://static-cdn.jtvnw.net/emoticons/v1/425618/1.0",
                  "4": "https://static-cdn.jtvnw.net/emoticons/v1/425618/3.0"
              },
              "start": 100,
              "end": 102
          },
          {
              "type": "twitch",
              "name": "LUL",
              "id": "425618",
              "gif": false,
              "urls": {
                  "1": "https://static-cdn.jtvnw.net/emoticons/v1/425618/1.0",
                  "2": "https://static-cdn.jtvnw.net/emoticons/v1/425618/1.0",
                  "4": "https://static-cdn.jtvnw.net/emoticons/v1/425618/3.0"
              },
              "start": 104,
              "end": 106
          },
          {
              "type": "twitch",
              "name": "LUL",
              "id": "425618",
              "gif": false,
              "urls": {
                  "1": "https://static-cdn.jtvnw.net/emoticons/v1/425618/1.0",
                  "2": "https://static-cdn.jtvnw.net/emoticons/v1/425618/1.0",
                  "4": "https://static-cdn.jtvnw.net/emoticons/v1/425618/3.0"
              },
              "start": 108,
              "end": 110
          },
          {
              "type": "twitch",
              "name": "LUL",
              "id": "425618",
              "gif": false,
              "urls": {
                  "1": "https://static-cdn.jtvnw.net/emoticons/v1/425618/1.0",
                  "2": "https://static-cdn.jtvnw.net/emoticons/v1/425618/1.0",
                  "4": "https://static-cdn.jtvnw.net/emoticons/v1/425618/3.0"
              },
              "start": 112,
              "end": 114
          },
          {
              "type": "twitch",
              "name": "LUL",
              "id": "425618",
              "gif": false,
              "urls": {
                  "1": "https://static-cdn.jtvnw.net/emoticons/v1/425618/1.0",
                  "2": "https://static-cdn.jtvnw.net/emoticons/v1/425618/1.0",
                  "4": "https://static-cdn.jtvnw.net/emoticons/v1/425618/3.0"
              },
              "start": 116,
              "end": 118
          },
          {
              "type": "twitch",
              "name": "LUL",
              "id": "425618",
              "gif": false,
              "urls": {
                  "1": "https://static-cdn.jtvnw.net/emoticons/v1/425618/1.0",
                  "2": "https://static-cdn.jtvnw.net/emoticons/v1/425618/1.0",
                  "4": "https://static-cdn.jtvnw.net/emoticons/v1/425618/3.0"
              },
              "start": 120,
              "end": 122
          },
          {
              "type": "twitch",
              "name": "LUL",
              "id": "425618",
              "gif": false,
              "urls": {
                  "1": "https://static-cdn.jtvnw.net/emoticons/v1/425618/1.0",
                  "2": "https://static-cdn.jtvnw.net/emoticons/v1/425618/1.0",
                  "4": "https://static-cdn.jtvnw.net/emoticons/v1/425618/3.0"
              },
              "start": 124,
              "end": 126
          },
          {
              "type": "twitch",
              "name": "LUL",
              "id": "425618",
              "gif": false,
              "urls": {
                  "1": "https://static-cdn.jtvnw.net/emoticons/v1/425618/1.0",
                  "2": "https://static-cdn.jtvnw.net/emoticons/v1/425618/1.0",
                  "4": "https://static-cdn.jtvnw.net/emoticons/v1/425618/3.0"
              },
              "start": 128,
              "end": 130
          },
          {
              "type": "twitch",
              "name": "LUL",
              "id": "425618",
              "gif": false,
              "urls": {
                  "1": "https://static-cdn.jtvnw.net/emoticons/v1/425618/1.0",
                  "2": "https://static-cdn.jtvnw.net/emoticons/v1/425618/1.0",
                  "4": "https://static-cdn.jtvnw.net/emoticons/v1/425618/3.0"
              },
              "start": 132,
              "end": 134
          },
          {
              "type": "twitch",
              "name": "LUL",
              "id": "425618",
              "gif": false,
              "urls": {
                  "1": "https://static-cdn.jtvnw.net/emoticons/v1/425618/1.0",
                  "2": "https://static-cdn.jtvnw.net/emoticons/v1/425618/1.0",
                  "4": "https://static-cdn.jtvnw.net/emoticons/v1/425618/3.0"
              },
              "start": 136,
              "end": 138
          },
          {
              "type": "twitch",
              "name": "LUL",
              "id": "425618",
              "gif": false,
              "urls": {
                  "1": "https://static-cdn.jtvnw.net/emoticons/v1/425618/1.0",
                  "2": "https://static-cdn.jtvnw.net/emoticons/v1/425618/1.0",
                  "4": "https://static-cdn.jtvnw.net/emoticons/v1/425618/3.0"
              },
              "start": 140,
              "end": 142
          },
          {
              "type": "twitch",
              "name": "LUL",
              "id": "425618",
              "gif": false,
              "urls": {
                  "1": "https://static-cdn.jtvnw.net/emoticons/v1/425618/1.0",
                  "2": "https://static-cdn.jtvnw.net/emoticons/v1/425618/1.0",
                  "4": "https://static-cdn.jtvnw.net/emoticons/v1/425618/3.0"
              },
              "start": 144,
              "end": 146
          }
      ],
      "msgId": "3c4870e0-ad3e-475d-bc19-900fb543eaa3"
  },
    {
      "nick": "aaroniush",
      "userId": "43658519",
      "displayName": "Phil",
      //"displayColor": "#7A0D82",
      "badges": [
          {
              "type": "broadcaster",
              "version": "1",
              "url": "https://static-cdn.jtvnw.net/badges/v1/5527c58c-fb7d-422d-b71b-f309dcb85cc1/3",
              "description": "Broadcaster"
          },
          {
              "type": "subscriber",
              "version": "3012",
              "url": "https://static-cdn.jtvnw.net/badges/v1/1cd74dc7-59a8-407a-929b-f90c2c745d3c/3",
              "description": "1-Year Subscriber"
          }
      ],
      "channel": "aaroniush",
      "text": "Howdy! 🤠🤠",
      "isAction": false,
      "emotes": [
          {
              "type": "emoji",
              "name": "1f920",
              "id": "1f920",
              "gif": false,
              "urls": {
                  "1": "https://twemoji.maxcdn.com/2/72x72/1f920.png"
              }
          },
          {
              "type": "emoji",
              "name": "1f920",
              "id": "1f920",
              "gif": false,
              "urls": {
                  "1": "https://twemoji.maxcdn.com/2/72x72/1f920.png"
              }
          }
      ],
      "msgId": "827194c0-68af-43e6-bbd2-4f0ff7b66f71"
  },
    {
      "nick": "aaroniush",
      "userId": "43658519",
      "displayName": "Pokimane",
      //"displayColor": "#8DA5ED",
      "badges": [
      ],
      "channel": "aaroniush",
      "text": "using /me for this message so you can see how this message looks in color! ! !",
      "isAction": true,
      "emotes": [],
      "msgId": "723e9150-cf1a-44be-a083-609dfe47e6a3"
  },{
      "time": 1619570195409,
      "tags": {
          "badge-info": "subscriber/1",
          "badges": "moderator/1,subscriber/0",
          "client-nonce": "035455fa2c18f517a6d16c4a7cc00d53",
          "color": "#5F9EA0",
          "display-name": "AaroniusBot",
          "emotes": "301428702:86-88,177-179",
          "flags": "",
          "id": "622ec981-5ed5-4afd-926e-25f345fc1ab5",
          "mod": "1",
          "room-id": "43658519",
          "subscriber": "1",
          "tmi-sent-ts": "1619570195984",
          "turbo": "0",
          "user-id": "597885498",
          "user-type": "mod"
      },
      "nick": "aaroniusbot",
      "userId": "597885498",
      "displayName": "YourFriendlyMod",
      "displayColor": "#5F9EA0",
      "badges": [
          {
              "type": "moderator",
              "version": "1",
              "url": "https://static-cdn.jtvnw.net/badges/v1/3267646d-33f0-4b17-b3df-f923a41db1d0/3",
              "description": "Moderator"
          }
      ],
      "channel": "aaroniush",
      "text": "Helloo! I'm a mod! Don't get too snarky or I'm gonna have to give you the ban hammer  BOP  Helloo! I'm a mod! Don't get too snarky or I'm gonna have to give you the ban hammer  BOP",
      "isAction": false,
      "emotes": [
          {
              "type": "twitch",
              "name": "BOP",
              "id": "301428702",
              "gif": false,
              "urls": {
                  "1": "https://static-cdn.jtvnw.net/emoticons/v1/301428702/1.0",
                  "2": "https://static-cdn.jtvnw.net/emoticons/v1/301428702/1.0",
                  "4": "https://static-cdn.jtvnw.net/emoticons/v1/301428702/3.0"
              },
              "start": 86,
              "end": 88
          },
          {
              "type": "twitch",
              "name": "BOP",
              "id": "301428702",
              "gif": false,
              "urls": {
                  "1": "https://static-cdn.jtvnw.net/emoticons/v1/301428702/1.0",
                  "2": "https://static-cdn.jtvnw.net/emoticons/v1/301428702/1.0",
                  "4": "https://static-cdn.jtvnw.net/emoticons/v1/301428702/3.0"
              },
              "start": 177,
              "end": 179
          }
      ],
      "msgId": "622ec981-5ed5-4afd-926e-25f345fc1ab5"
  }
    
  ]