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

io.on('connection',function(socket){
    var thisPlayer
    //adding player name
    socket.on("player_name",function(name){
        thisPlayer = name
        bluff.add(new Player(name, socket.id))

        socket.emit("yourid",socket.id)

        //let all players know that this player has joined the game
        io.emit("player_list",bluff.state.players)

        //if there is only one player, make him the leader
        if(bluff.state.players[0].socketid == socket.id){
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
        if(bluff.state.most_recent_hand.isbluff){
            losershand = bluff.state.players[bluff.state.most_recent_hand.player].hand

        }else{
            losershand = bluff.state.players[bluff.state.active_player].hand
            bluff.state.active_player = bluff.state.most_recent_hand.player
        }
        for(var play of bluff.state.curround_plays){
            losershand.push.apply(losershand, play.cards)
        }
        //consider turning this into a function for more readability later
        bluff.state.curround_plays = []
        bluff.state.most_recent_hand = {
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
            io.emit("player_list",bluff.state.players)
            //marked for later
            if(bluff.state.players[0]){
                socket.broadcast.to(bluff.state.players[0].socketid).emit("isleader","hey you are the leader of this game")
            }
        }else{
            io.emit("game_state",bluff.state)
        }
    })
    
    socket.on('pass',function(d){
        console.log("person wants to pass");
        if(bluff.state.active_player == bluff.state.most_recent_hand.player){
            //can change it if we want the player who started the round to go again
            bluff.state.active_player = (bluff.state.curround_plays[0].player + 1) % bluff.state.players.length
            bluff.state.curround_plays = []
            bluff.state.most_recent_hand = {
                isbluff: false,
                cards:[],
                player:null
            }
            bluff.state.curround_card_value = null
             let winner = checkwin(bluff.state)
            if(winner){
                io.emit("winner",winner)
                bluff.endGame()
                io.emit("player_list",bluff.state.players)
                //marked for later observation
                if(bluff.state.players[0]){
                    socket.broadcast.to(bluff.state.players[0].socketid).emit("isleader","hey you are the leader of this game")
                }
            }else{
                io.emit("game_state",bluff.state)
            }
        }else{
            bluff.state.active_player = (bluff.state.active_player + 1) % bluff.state.players.length
            io.emit("game_state",bluff.state)
        }
       
    })

    socket.on('play',function(data){
        console.log("player wants to play some stuff");
        bluff.state.most_recent_hand = {
            isbluff: false,
            cards:[],
            player:null
        }
        //can do a check here for curround_card_value
        bluff.state.curround_card_value = data.choosen_card
        for(var i in data.selected_cards){
            curcard = bluff.state.players[bluff.state.active_player].discard(data.selected_cards[i])
            if(curcard.value != bluff.state.curround_card_value){
                bluff.state.most_recent_hand.isbluff = true;
            }
            bluff.state.most_recent_hand.cards.push(curcard)
        }
        bluff.state.most_recent_hand.player = bluff.state.active_player
        bluff.state.curround_plays.push(bluff.state.most_recent_hand)

        bluff.state.active_player = (bluff.state.active_player + 1) % bluff.state.players.length

        io.emit("game_state",bluff.state)
    })

    socket.on('disconnect',function(){
        for(let i in bluff.state.players){
            if(bluff.state.players[i].socketid == socket.id){
                bluff.state.players.splice(i,1)
                if(i == 0 && !bluff.state.gameon){
                    socket.broadcast.to(bluff.state.players[0].socketid).emit("isleader","hey you are the leader of this game")
                }
                break;
            }
        }
        //initial attempt to deal with players leaving early
        if(bluff.state.gameon){
            if(bluff.state.active_player > bluff.state.players.length){
                bluff.state.active_player = 0;
            }
            io.emit("game_state",bluff.state)
        }
        io.emit("player_list",bluff.state.players)
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
