const Deck = require('./deck_of_cards').Deck
const Player = require('./deck_of_cards').Player
const Card = require('./deck_of_cards').Card
const Bluff = require('./deck_of_cards').Bluff


const express = require('express')
const app = express();
app.use(express.static(__dirname+"/public"))
const server = app.listen(8000,()=>console.log("listening on port 8000"))
const io = require('socket.io')(server);


var bluff = new Bluff()
var recent_hand = bluff.state.most_recent_hand
var state = bluff.state
var current_round_plays = bluff.state.curround_plays
var players = bluff.state.players

io.on('connection',function(socket){
    var thisPlayer
    //adding player name
    socket.on("player_name",function(name){
        thisPlayer = name
        
        socket.emit("yourid",socket.id)
        //let all players know that this player has joined the game
        if(!state.gameon){
            bluff.add(new Player(name, socket.id))
            io.emit("player_list",players)
        }else{
            //add to watch list
            console.log("a watcher has arrived");
            socket.emit("game_state",state)
        }
        
        //if there is only one player, make him the leader
        if(players[0].socketid == socket.id){
            socket.emit("isleader","hey you are the leader of this game")
        }
    })
    
    socket.on('startgame',function(d){
        bluff.start()
        io.emit("game_state",bluff.state)
    })

    socket.on('callbluff',function(d){
        console.log("person called bluff");
        let losershand
        if(recent_hand.isbluff){
            losershand = players[recent_hand.player].hand

        }else{
            losershand = players[state.active_player].hand
            state.active_player = recent_hand.player
        }
        for(var play of current_round_plays){
            losershand.push.apply(losershand, play.cards)
        }
        //consider turning this into a function for more readability later
        current_round_plays = []
        recent_hand = {
            isbluff: false,
            cards:[],
            player:null
        }
        bluff.state.curround_card_value = null
        //io.emit("game_state",bluff.state)
        let winner = checkwin(bluff.state)
        if(winner){
            io.emit("winner",winner)
            bluff.endGame()
            io.emit("player_list",players)
            //marked for later
            if(players[0]){
                socket.broadcast.to(players[0].socketid).emit("isleader","hey you are the leader of this game")
            }
        }else{
            io.emit("game_state",bluff.state)
        }
    })
    socket.on('pass',function(d){
        console.log("person wants to pass");
        if(state.active_player == recent_hand.player){
            //can change it if we want the player who started the round to go again
            state.active_player = (current_round_plays[0].player + 1) % players.length
            current_round_plays = []
            recent_hand = {
                isbluff: false,
                cards:[],
                player:null
            }
            bluff.state.curround_card_value = null
             let winner = checkwin(bluff.state)
            if(winner){
                io.emit("winner",winner)
                bluff.endGame()
                io.emit("player_list",players)
                //marked for later observation
                if(players[0]){
                    socket.broadcast.to(players[0].socketid).emit("isleader","hey you are the leader of this game")
                }
            }else{
                io.emit("game_state",bluff.state)
            }
        }else{
            state.active_player = (state.active_player + 1) % players.length
            io.emit("game_state",bluff.state)
        }
       
    })

    socket.on('play',function(data){
        console.log("player wants to play some stuff");
        recent_hand = {
            isbluff: false,
            cards:[],
            player:null
        }
        //can do a check here for curround_card_value
        bluff.state.curround_card_value = data.choosen_card
        for(var i in data.selected_cards){
            curcard = players[state.active_player].discard(data.selected_cards[i])
            if(curcard.value != bluff.state.curround_card_value){
                recent_hand.isbluff = true;
            }
            recent_hand.cards.push(curcard)
        }
        recent_hand.player = state.active_player
        current_round_plays.push(recent_hand)

        state.active_player = (state.active_player + 1) % players.length

        io.emit("game_state",bluff.state)
    })

    socket.on('disconnect',function(){
        for(let i in players){
            if(players[i].socketid == socket.id){
                if(state.active_player == i){
                    state.active_player = (state.active_player +1) % (players.length -1)
                }
                players.splice(i,1)
                if(i == 0 && !bluff.state.gameon){
                    socket.broadcast.to(players[0].socketid).emit("isleader","hey you are the leader of this game")
                }
                break;
            }
        }
        //initial attempt to deal with players leaving early
        if(bluff.state.gameon){
            io.emit("game_state",bluff.state)
        }else{
            io.emit("player_list",players)
        }
    })
})

function checkwin(state){
    for(let player of state.players){
        if(player.hand.length == 0){
            return player
        }
    }
    return null
}
