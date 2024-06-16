// import Card from "./card"

const LAST_N_MESSAGES = 2

document.addEventListener('DOMContentLoaded', () => {
    const playerName = document.querySelector("#start-game-name-area")
    document.querySelector('#join-game-button').addEventListener('click', startMultiPlayer)
    document.querySelector("#dc-game-button").addEventListener('click', dc)
    document.getElementById("shuffle-teams-button").addEventListener('click', shuffleTeams)
    document.getElementById("start-game-button").addEventListener('click', startGame)
    document.getElementById("ask-button").addEventListener('click', askForCard)
    document.getElementById("declare-set").addEventListener('click', declareSet)

    const ranks = ["Ace", "2", "3", "4", "5", "6", "7", "8", "9", "10", "Jack", "Queen", "King", "BW Joker", "Colored Joker"]
    const suits = ["", "Hearts", "Spades", "Diamonds", "Clubs"]
    const books = ["Low Hearts", "Low Spades", "Low Diamonds", "Low Clubs", "High Hearts", "High Spades", "High Diamonds", "High Clubs", "Extra"]
    document.getElementById("rank-selector").innerHTML = ranks.map((rank) => `<option>${rank}</option>`).join()
    document.getElementById("suit-selector").innerHTML = suits.map((suit) => `<option>${suit}</option>`).join()
    document.getElementById("book-selector").innerHTML = books.map((book, i) => `<option>${book}</option>`).join()

    let socket = null
    let messages = []
    let players = []
    let myIndex = -1
    
    function startMultiPlayer() {
        socket = io();
        socket.on('player-number', num => {
            if (num === -1) {
                alert("Sorry, the server is full")
                // todo: spectator?
            } else {
                console.log(`You are player ${num}`)
                myIndex = num
                socket.emit('player-name', playerName.value)
                document.getElementById("shuffle-teams-button").style.display = "inline"
                document.getElementById("start-game-button").style.display = "inline"
            }
        })
        socket.on('teams', teams => {
            console.log("player joined")
            console.log(teams)
            document.getElementById("player-info-table").innerHTML = `Team 1: ${teams[0].join(", ")}<br/>Team 2: ${teams[1].join(", ")}`
            const names = teams[0].concat(teams[1])
            document.getElementById("player-name-selector").innerHTML = names.map((name) => `<option>${name}</option>`).join()
        })
        socket.on('message', ({ message, playerInTurn, books }) => {
            messages.push(message)
            messages = messages.slice(-1 * LAST_N_MESSAGES)
            document.getElementById("messages").innerHTML = `Messages:<br/>${messages.join("<br/>")}`
            socket.emit('get-hand')
            socket.on('get-hand-response', (handNames, handCodes) => {
                let handText = []
                if (books[0].length) {
                    handText.push(`Team 1 has ${books[0].join(", ")}`)
                } else {
                    handText.push(`Team 1 has no books`)
                }
                if (books[1].length) {
                    handText.push(`Team 2 has ${books[1].join(", ")}`)
                } else {
                    handText.push(`Team 2 has no books`)
                }
                if (books[0].length > 4 || books[1].length > 4) {
                    handText.push(`Game Over!`)
                }
                handText.push("")
                // handText.push(`Your Hand: ${handNames.join(", ")}`)
                handText.push(`Your Hand:`)
                handText.push(handCodes.map((card) => `<img src="card/static/${card}.svg" style="width: 80px" />`).join(""))
                document.getElementById("hand").innerHTML = handText.join("<br/>")
                document.getElementById("declarebox").style.display = "inline"
                document.getElementById("messages").style.display = "inline"
            })
            if (playerInTurn === myIndex) {
                document.getElementById("askbox").style.display = "block"
            } else {
                document.getElementById("askbox").style.display = "none"
            }
        })
        socket.on("ask-failed", (resp) => {
            alert(resp)
        })
        socket.on("start-game-response", game => {
            if (game === -1) {
                alert("Need 6 players to start!")
                return
            } else if (game === -2) {
                alert("Game is already on. Press End Game to stop.")
            }
        })
    }

    function dc() {
        if (socket === null) return
        document.getElementById("shuffle-teams-button").style.display = "none"
        document.getElementById("start-game-button").style.display = "none"
        document.getElementById("player-info-table").innerHTML = ""
        document.getElementById("messages").innerHTML = "Messages:"
        document.getElementById("messages").style.display = "none"
        document.getElementById("hand").innerHTML = ""
        document.getElementById("askbox").style.display = "none"
        document.getElementById("declarebox").style.display = "none"
        socket.disconnect()
    }

    function shuffleTeams() {
        socket.emit("shuffle-teams")
    }

    function startGame() {
        document.getElementById("messages").innerHTML = "Messages:"
        socket.emit("start-game")
    }

    function askForCard() {
        const playerName = document.getElementById("player-name-selector").value
        const rank = document.getElementById("rank-selector").value
        const suit = document.getElementById("suit-selector").value
        socket.emit(
            "ask-for-card", 
            playerName,
            rank,
            suit
        )
    }

    function declareSet() {
        const book = document.getElementById("book-selector").value
        socket.emit("declare", book)
    }
})