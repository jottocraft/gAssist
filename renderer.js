//Set client ID and client secret
const CLIENT_ID = "965335174728-kupmqb1pu4ur6ffpq3g3m7f2ks7v07mn.apps.googleusercontent.com";
const CLIENT_SECRET = "DHYn5Kj6VErPiNaDfLGQAq41";
const PROJECT_ID = "gassist-eaa80";
const DEVICE_MODEL_ID = "gassist-jottocraft";

//Load HTML when ready
$(document).ready(loadContent);

function loadContent() {
    if (window.localStorage.refreshToken && window.localStorage.deviceInstance) {
        //User is logged in, load assistant and conversation view
        loadAssistant();

        $("#content").html(`
            <div id="messages"></div>
            <div id="inputFooter">
                <div id="inputSuggestions"></div>
                <input autofocus onkeydown="if(event.keyCode==13) onInput()" id="assistantInput" placeholder="Type a message" />
            </div>
        `);
    } else {
        //User is NOT logged in, show sign in screen
        $("#content").html(`
            <p>Welcome to gAssist, an unofficial Google Assistant client for Windows. To get started, you'll need to sign in with your Google Account.</p>
            <p>Make sure to allow gAssist through Windows Firewall if prompted.</p>
            <br />
            <button onclick="getAuthCreds()" class="btn"><i class="material-icons">lock</i> Sign in</button>
        `);
    }
}

function onInput(text) {
    //Get message from input parameter or text box
    var message = text || $("#assistantInput").val();

    //Clear text box
    $("#assistantInput").val("");

    //Show user input in the conversation
    $("#messages").append(`<div class="message user">
        <p>${message}</p>
    </div>`);

    //Show loading indicator in the conversation
    $("#messages").append(`<div class="message assistant thinking">
        <div class="thinkingSpinner">
            <div class="bounce1"></div>
            <div class="bounce2"></div>
            <div class="bounce3"></div>
        </div>
    </div>`);

    //Scroll to the bottom of the conversation
    $("#content").scrollTop($("#content").prop("scrollHeight"));

    //Ask the Google Assistant
    assist(message).then(response => {
        //Render response depending on the type (text, screen, or no response)
        if (response.text) {
            $(".message.assistant.thinking").removeClass("thinking").addClass("text").html(`<p>${response.text}</p>`);
        } else if (response.screen) {
            $(".message.assistant.thinking").removeClass("thinking").addClass("screen").html(`<iframe class="screen" src="${response.screen}" />`);
        } else {
            $(".message.assistant.thinking").remove();
        }

        //Render suggestions
        if (response.suggestions) {
            $("#inputSuggestions").html(response.suggestions.map(suggestion => `<p onclick="onInput('${suggestion}')">${suggestion}</p>`).join(""));
        }

        //Scroll to the bottom of the conversation
        $("#content").scrollTop($("#content").prop("scrollHeight"));
    });
}

function getAuthCreds() {
    var { shell } = require('electron');
    var http = require('http');
    var url = require('url');

    //Generate random auth state
    var state = "gAssistAuth" + Math.floor(Math.random() * 1000);

    //Open sign-in page
    shell.openExternal("https://accounts.google.com/o/oauth2/auth?response_type=code&client_id=" + CLIENT_ID + "&redirect_uri=http%3A%2F%2Flocalhost%3A8180%2F&scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fassistant-sdk-prototype&state=" + state + "&access_type=offline");

    //Start HTTP server to get the response
    var server = http.createServer(function (req, res) {
        //Get response URL parameters
        var q = url.parse(req.url, true).query;

        if ((q.state == state) && q.code) {
            //State match and code retrived, now get refresh token
            $.ajax({
                method: "POST",
                url: "https://accounts.google.com/o/oauth2/token",
                data: `client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}&grant_type=authorization_code&code=${q.code}&redirect_uri=http%3A%2F%2Flocalhost%3A8180%2F`,
                success: function (data) {
                    if (data.refresh_token) {
                        //Found refresh token, save to local storage
                        window.localStorage.setItem("refreshToken", data.refresh_token);

                        //Generate random device instance ID and save to local storage
                        window.localStorage.setItem("deviceInstance", makeid(75));

                        //Register device instance
                        $.ajax({
                            type: "POST",
                            url: "https://embeddedassistant.googleapis.com/v1alpha2/projects/" + PROJECT_ID + "/devices/",
                            contentType: 'application/json',
                            data: JSON.stringify({
                                "id": window.localStorage.deviceInstance,
                                "model_id": DEVICE_MODEL_ID,
                                "nickname": "gAssist",
                                "client_type": "SDK_SERVICE"
                            }),
                            headers: {
                                Authorization: "Bearer " + data.access_token
                            },
                            success: function () {
                                //Device instance successfully registered with the ID generated earlier
                                res.write("Authentication has completed. You may now close this window.");
                                res.end();
                                server.close();
                                loadContent(); //Load content after authentication is complete
                            },
                            error: function(err) {
                                //Authentication error
                                res.write("Failed to authenticate. Please try again.");
                                res.end();
                            }
                        });

                    } else {
                        //Authentication error
                        res.write("Failed to authenticate. Please try again.");
                        res.end();
                    }
                },
                error: function () {
                    //Authentication error
                    res.write("Failed to authenticate. Please try again.");
                    res.end();
                }
            });
        } else {
            //Authentication error
            res.write("Failed to authenticate. Please try again.");
            res.end();
        }
    }).listen(8180);
}

function makeid(length) {
    //Generates a random ID
    var result = '';
    var characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    var charactersLength = characters.length;
    for (var i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return result;
}