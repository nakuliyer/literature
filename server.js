const express = require('express')
const path = require('path')
const http = require('http')
const PORT = process.env.PORT || 3000
const socketio = require('socket.io')
const app = express()
const server = http.createServer(app)
const io = socketio(server)

// Set static folder
app.use(express.static(path.join(__dirname, "public")))

// Start server
server.listen(PORT, () => console.log(`Server running on port ${PORT}`))

// utils
function sendAll(socket, message, ...arg) {
    socket.emit(message, ...arg)
    socket.broadcast.emit(message, ...arg)
}

function shuffle(a) {
    let shuffled = a
        .map(value => ({ value, sort: Math.random() }))
        .sort((a, b) => a.sort - b.sort)
        .map(({ value }) => value)
    return shuffled
}

const flip = (data) => Object.fromEntries(
    Object.entries(data).map(([key, value]) => [value, key])
)

const RANK_TO_NAME = {
    "A": "Ace",
    "T": "10",
    "J": "Jack",
    "Q": "Queen",
    "K": "King"
}

const PRETTY_TO_RANK = flip(RANK_TO_NAME)

const SUIT_TO_NAME = {
    "D": "Diamonds",
    "C": "Clubs",
    "H": "Hearts",
    "S": "Spades"
}

const PRETTY_TO_SUIT = flip(SUIT_TO_NAME)

function cardToName(rank, suit) {
    if (suit === "J") {
        if (rank === "1") {
            return "BW Joker"
        } else if (rank === "2") {
            return "Colored Joker"
        }
    }
    const prettyRank = rank in RANK_TO_NAME ? RANK_TO_NAME[rank] : rank
    const prettySuit = SUIT_TO_NAME[suit]
    return `${prettyRank} of ${prettySuit}`
}

function nameToCard(prettyRank, prettySuit) {
    let rank = ""
    let suit = ""
    if (prettyRank === "BW Joker") {
        rank = "1"
        suit = "J"
    } else if (prettyRank === "Colored Joker") {
        rank = "2"
        suit = "J"
    } else {
        rank = prettyRank in PRETTY_TO_RANK ? PRETTY_TO_RANK[prettyRank] : prettyRank
        suit = PRETTY_TO_SUIT[prettySuit]
    }
    return { "rank": rank, "suit": suit }
}

const BOOKS = [
    ["AH", "2H", "3H", "4H", "5H", "6H"],
    ["AS", "2S", "3S", "4S", "5S", "6S"],
    ["AD", "2D", "3D", "4D", "5D", "6D"],
    ["AC", "2C", "3C", "4C", "5C", "6C"],
    ["8H", "9H", "TH", "JH", "QH", "KH"],
    ["8S", "9S", "TS", "JS", "QS", "KS"],
    ["8D", "9D", "TD", "JD", "QD", "KD"],
    ["8C", "9C", "TC", "JC", "QC", "KC"],
    ["7D", "7H", "7C", "7S", "1J", "2J"]
]

function getBookFromRankSuit(rank, suit) {
    for (const i in BOOKS) {
        if (BOOKS[i].includes(`${rank}${suit}`)) {
            return i
        }
    }
    return -1
}

const BOOK_NAME_TO_BOOK = {
    "Low Hearts": 0,
    "Low Spades": 1,
    "Low Diamonds": 2,
    "Low Clubs": 3,
    "High Hearts": 4,
    "High Spades": 5,
    "High Diamonds": 6,
    "High Clubs": 7,
    "Extra": 8
}

const BOOK_TO_BOOK_NAME = flip(BOOK_NAME_TO_BOOK)

// classes
class Card {
    constructor(rank, suit) {
        this.rank = rank
        this.suit = suit
        this.book = getBookFromRankSuit(rank, suit)
    }

    toName() {
        return cardToName(this.rank, this.suit)
    }

    toSimple() {
        return `${this.rank}${this.suit}`
    }

    isRankSuit(rank, suit) {
        return this.rank === rank && this.suit === suit
    }
}

class Deck {
    constructor() {
        const ranks = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K"]
        const suits = ["D", "C", "H", "S"]
        this.cards = []
        for (const rank of ranks) {
            for (const suit of suits) {
                this.cards.push(new Card(rank, suit))
            }
        }
        this.cards.push(new Card("1", "J"))
        this.cards.push(new Card("2", "J"))
    }

    shuffle() {
        this.cards = shuffle(this.cards)
    }
}

class Player {
    constructor(i) {
        this.i = i
        this.name = "Uninitialized"
        this.team = i < 3 ? 0 : 1
        this.hand = []
    }

    hasCard(rank, suit) {
        for (const card of this.hand) {
            if (card.isRankSuit(rank, suit)) {
                return true
            }
        }
        return false
    }

    hasCardInBook(book) {
        for (const card of this.hand) {
            if (card.book === book) {
                return true
            }
        }
        return false
    }
}

class GM {
    constructor(maxPlayers) {
        this.maxPlayers = maxPlayers
        this.players = []
        for (let i = 0; i < maxPlayers; ++i) {
            this.players.push(null)
        }
        this.gameOn = false
        this.playerInTurn = -1
        this.booksByTeam = [[], []]
    }

    // broadcasting methods
    sendTeams(socket) {
        const players = this.players.filter((player) => player != null)
        const teams = [
            players.filter(({ team }) => team == 0).map(({ name }) => name),
            players.filter(({ team }) => team == 1).map(({ name }) => name)
        ]
        sendAll(socket, 'teams', teams)
    }

    sendMessage(socket, message) {
        sendAll(socket, 'message', { 
            "message": message, 
            "playerInTurn": this.playerInTurn, 
            "books": [
                this.booksByTeam[0].map((book) => BOOK_TO_BOOK_NAME[book]),
                this.booksByTeam[1].map((book) => BOOK_TO_BOOK_NAME[book])
            ]
        })
    }

    getPlayerIndexByName(playerName) {
        for (const player of this.players) {
            if (player.name === playerName) {
                return player.i
            }
        }
        return -1
    }

    startGame() {
        if (this.players.filter((c) => c === null).length) {
            return -1
        } else if (this.gameOn) {
            // todo: end game?
            // return -2
        }

        this.booksByTeam = [[], []]
        this.gameOn = true
        this.deck = new Deck()
        this.deck.shuffle()
        const cardsPerHand = 54 / this.maxPlayers // todo: game fails if this is not int
        for (let i = 0; i < this.maxPlayers; ++i) {
            this.players[i].hand = this.deck.cards.slice(i * cardsPerHand, (i + 1) * cardsPerHand)
        }
        return 1
    }

    getHand(playerIndex) {
        return this.players[playerIndex].hand.map((card) => card.toName())
    }

    getName(playerIndex) {
        return this.players[playerIndex].name
    }

    getPlayerTeam(playerIndex) {
        return this.players[playerIndex].team
    }

    playerHasCard(playerIndex, rank, suit) {
        return this.players[playerIndex].hasCard(rank, suit)
    }

    playerHasCardInBook(playerIndex, book) {
        return this.players[playerIndex].hasCardInBook(book)
    }

    giveCard(fromPlayerIndex, toPlayerIndex, rank, suit) {
        // this fails if the player does not own the card already!
        let fromPlayerHandIndex = -1
        for (const i in this.players[fromPlayerIndex].hand) {
            if (this.players[fromPlayerIndex].hand[i].isRankSuit(rank, suit)) {
                fromPlayerHandIndex = i
            }
        }
        // remove card from hand
        this.players[fromPlayerIndex].hand.splice(fromPlayerHandIndex, 1)
        // gib to other player, todo: try to reuse the obj rather than create new one
        this.players[toPlayerIndex].hand.push(new Card(rank, suit))
    }

    removeCardsByBook(book) {
        let cardsGivenByPlayer = []
        let cardsGivenByTeam = [[], []]
        for (const player of this.players) {
            const cardsInHand = player.hand.filter((card) => getBookFromRankSuit(card.rank, card.suit) == book)
            player.hand = player.hand.filter((card) => getBookFromRankSuit(card.rank, card.suit) != book)
            cardsGivenByPlayer.push(cardsInHand)
            cardsGivenByTeam[player.team].push(...cardsInHand)
        }
        return {
            "cardsGivenByPlayer": cardsGivenByPlayer,
            "cardsGivenByTeam": cardsGivenByTeam
        }
    }

    bookHasBeenDeclared(book) {
        return (book in this.booksByTeam[0]) || (book in this.booksByTeam[1])
    }

    onPlayerJoin() {
        let playerIndex = -1
        for (let i = 0; i < this.maxPlayers; ++i) {
            if (this.players[i] === null) {
                playerIndex = i
                this.players[i] = new Player(playerIndex)
                console.log(`Player ${playerIndex} has connected`)
                break
            }
        }
        console.log(gm.players)
        return playerIndex
    }

    shuffleTeams() {
        const newTeams = shuffle([0, 0, 0, 1, 1, 1])
        for (let i = 0; i < this.maxPlayers; ++i) {
            if (this.players[i] === null) continue
            this.players[i].team = newTeams[i]
        }
    }

    disconnect(playerIndex) {
        this.players[playerIndex] = null
    }
}

// Handle a socket connection request from web client
const gm = new GM(6)

io.on('connection', socket => {
    const playerIndex = gm.onPlayerJoin()
    socket.emit('player-number', playerIndex)
    if (playerIndex === -1) {
        console.log('Player dropped')
        return
    }
    socket.on('player-name', (name) => {
        gm.players[playerIndex].name = name
        gm.sendTeams(socket)
    })

    // Start the game
    socket.on('start-game', () => {
        const resp = gm.startGame()
        socket.emit("start-game-response", resp)
        gm.sendMessage(socket, "Game Started!")
        gm.playerInTurn = Math.floor(Math.random() * gm.maxPlayers)
        gm.sendMessage(socket, `Player ${gm.getName(gm.playerInTurn)} is up`)
    })

    socket.on('get-hand', () => {
        socket.emit("get-hand-response", gm.getHand(playerIndex))
    })

    socket.on("ask-for-card", (playerName, prettyRank, prettySuit) => {
        console.log(`asking for card ${playerName} ${prettyRank} ${prettySuit}`)
        const askPlayerIndex = gm.getPlayerIndexByName(playerName)
        if (askPlayerIndex === -1) {
            socket.emit("ask-failed", `Failed to get player ${playerName}`)
            return
        }
        if (askPlayerIndex === playerIndex) {
            socket.emit("ask-failed", `Cannot ask self for card!`)
            return
        }
        if (gm.getPlayerTeam(askPlayerIndex) === gm.getPlayerTeam(playerIndex)) {
            socket.emit("ask-failed", `Cannot ask teammate for a card!`)
            return
        }
        if ((prettyRank === "BW Joker" || prettyRank === "Colored Joker") && prettySuit) {
            socket.emit("ask-failed", `Cannot give a suit when asking for a joker!`)
            return
        }
        const { rank, suit } = nameToCard(prettyRank, prettySuit)
        if (gm.playerHasCard(playerIndex, rank, suit)) {
            socket.emit("ask-failed", `Cannot ask for a card that you own!`)
            return
        }
        if (!gm.playerHasCardInBook(playerIndex, getBookFromRankSuit(rank, suit))) {
            socket.emit("ask-failed", `Cannot ask for a card if you don't have a card from that book!`)
            return
        }
        let messagesToSend = []
        messagesToSend.push(`${gm.getName(playerIndex)} asked ${gm.getName(askPlayerIndex)} for the ${cardToName(rank, suit)}`)
        if (gm.playerHasCard(askPlayerIndex, rank, suit)) {
            messagesToSend.push(`The ask succeeded! ${gm.getName(playerIndex)} is still up.`)
            gm.giveCard(askPlayerIndex, playerIndex, rank, suit)
            gm.sendMessage(socket, messagesToSend.join("<br/>"))
        } else {
            messagesToSend.push(`The ask failed! ${gm.getName(askPlayerIndex)} is now up.`)
            gm.playerInTurn = askPlayerIndex
            gm.sendMessage(socket, messagesToSend.join("<br/>"))
        }
    })

    socket.on("declare", (bookName) => {
        const book = BOOK_NAME_TO_BOOK[bookName]
        if (gm.bookHasBeenDeclared(book)) {
            socket.emit("ask-failed", `Book has already been declared!`)
            return
        }
        let messagesToSend = []
        messagesToSend.push(`${gm.getName(playerIndex)} declared the "${bookName}" book!`)
        const { cardsGivenByPlayer, cardsGivenByTeam } = gm.removeCardsByBook(book)
        for (const player in cardsGivenByPlayer) {
            if (cardsGivenByPlayer[player].length) {
                const cardsGiven = cardsGivenByPlayer[player].map((card) => card.toName()).join(", ")
                messagesToSend.push(`${gm.getName(player)} gave up ${cardsGiven}`)
            } else {
                messagesToSend.push(`${gm.getName(player)} gave up no cards`)
            }
        }
        const myTeam = gm.getPlayerTeam(playerIndex)
        const otherTeam = myTeam === 1 ? 0 : 1
        if (cardsGivenByTeam[otherTeam].length) {
            messagesToSend.push(`Declaration failed! The "${bookName}" book goes to Team ${otherTeam + 1}`)
            gm.booksByTeam[otherTeam].push(book)
            gm.sendMessage(socket, messagesToSend.join("<br/>"))
        } else {
            messagesToSend.push(`Declaration successful! The "${bookName}" book goes to Team ${myTeam + 1}`)
            gm.booksByTeam[myTeam].push(book)
            gm.sendMessage(socket, messagesToSend.join("<br/>"))
        }
    })

    // Shuffle Teams
    socket.on("shuffle-teams", () => {
        gm.shuffleTeams()
        gm.sendTeams(socket)
    })

    // Handle Diconnect
    socket.on('disconnect', () => {
        console.log(`Player ${playerIndex} disconnected`)
        gm.disconnect(playerIndex)
        console.log(gm.players)
        gm.sendTeams(socket)
    })
})