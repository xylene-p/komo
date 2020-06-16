import React, { Component } from 'react';
import 'bootstrap/dist/css/bootstrap.min.css';
import { database, auth } from './firebase';
import HostView from './components/HostView';
import StartView from './components/StartView';
import LobbyView from './components/LobbyView';
import GameView from './components/GameView';
import JoinForm from './components/forms/JoinForm';
import CreateForm from './components/forms/CreateForm';
import ResultView from './components/ResultView';
import AwaitResultsView from './components/AwaitResultsView';
import VotingView from './components/VotingView';
// eslint-disable-next-line
import AdminView from './components/AdminView';
import Timer from './components/Timer';

class App extends Component {
  constructor(props) {
    super(props);

    this.state = {
      categoriesList: [],
      roomCode: null,
      numPlayers: 0,
      isHost: false,
      isHostView: false,
      isStartView: true,
      isLobbyView: false,
      isJoinView: false,
      isGameView: false,
      isResultView: false,
      isAwaitResultsView: false,
      isVotingView: false,
      currentUser: null,
      username: null,
      isValidRoom: null,
      numCategories: 0,
      players: [],
      isAnswerSubmitted: false,
      submittedPlayers: [],
      modalShowCreateGame: false,
      modalShowJoinGame: false,
      localCategories: [],
      categoryLetter: null,
      timeRemaining: null,
      timerShow: false,
      isGameOver: false,
      scores: {},
    };
  }

  componentDidMount() {
    // Sign out by default for now so we can test the 'Anonymous Login' button.
    // TODO: Probably should remove this in production TM.
    auth.signOut();

    auth.onAuthStateChanged((user) => {
      if (user) {
        console.log("[local] setting current user id as " + user.uid);
        this.setState({
          currentUser: user.uid,
        });
      }
    });
  }

  onChangeAnswer = (categoryId, event) => {
    // Preferred way to modify an element in a state array:
    // https://stackoverflow.com/a/42037439/6606953
    const newCategories = this.state.categoriesList// copy the array
    newCategories[categoryId].answer = event.target.value; // manipulate data
    this.setState({categoriesList: newCategories}) // set the new state
  }

  onChangeVoteCheckbox = (categoryId, uid, event) => {
    // Preferred way to invert a boolean inside an object inside an array:
    // https://stackoverflow.com/a/49502115
    let voteResults = [...this.state.voteResults]
    let item = {...voteResults[categoryId]}
    item[uid] = !item[uid]
    voteResults[categoryId] = item

    this.setState({
      voteResults
    })
  }

  generateRoomCode = async (length = 4) => {
    var result           = '';
    var characters       = 'ABCDEFGHIJKLMNPQRSTUVWXYZ12345679';
    var charactersLength = characters.length;
    for ( var i = 0; i < length; i++ ) {
       result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    this.setState({
      roomCode: result,
    }, () => {
      this.setValidRoom(true)
    }); // OnAuthStateChanged expects a valid this.state.roomCode for host,
        // so don't login until setState is completed
    return result
  }

  checkRoomCode = async () => {
    console.log("checkRoomCode")
    database.ref(this.state.roomCode).once('value').then((snapshot) => {
      if (snapshot.exists()) {
        console.log(this.state.roomCode + " is a valid room");
        this.updateNumPlayersDbAndLocal();
        this.setValidRoom(true);
        return this.state.roomCode
      } else {
        alert("This is not a valid room. Please try again");
        this.setValidRoom(false);
      }
    });
  }

  setHostDb = () => {
    database.ref(this.state.roomCode+"/host")
      .set(this.state.currentUser)
  }

  login = async () => {
    console.log("Logging in")
    return (await auth.signInAnonymously()).user.uid
  }

  createUser = (uid) => {
    database.ref(this.state.roomCode).child('players').child(uid).child('name').set(this.state.username);
    return uid
  }

  createGame = () => {
    this.setState({
      modalShowCreateGame: true,
    })
  }

  joinGame = () => {
    this.setState({
      modalShowJoinGame: true,
    })
  }

  updateNumPlayersDbAndLocal = () => {
    const numPlayersRef = database.ref(this.state.roomCode+"/numPlayers")
    numPlayersRef.transaction((count) => {
      let total = count + 1
      this.setState({
        numPlayers: total
      })
      return total
    })
  }

  setHostLocal = () => {
    this.setState({
      isHost: true,
    })
  }

  listenNumPlayersDb = () => {
    database.ref(this.state.roomCode+"/numPlayers").on('value', (snapshot) => {
      this.setState({
        numPlayers: snapshot.val()
      })
    })
  }

  submitCreateForm = () => {
    this.generateRoomCode()
      .then(this.login()
        .then(this.createUser)
          .then(this.updateNumPlayersDbAndLocal)
            .then(this.listenNumPlayersDb))
              .then(this.setHostDb)
                .then(this.setHostLocal)
    this.setState({
      isStartView: false,
      modalShowCreateGame: false,
      isLobbyView: true,
      isHostView: true,
      isHost: true,
    })
  }

  submitJoinForm = () => {
    this.checkRoomCode()
      .then(this.login()
        .then(this.createUser))
    this.setState({
      isStartView: false,
      modalShowJoinGame: false,
      isLobbyView: true,
    })
  }

  setLobbyView = () => {
    console.log('[local] List of players: ' + this.state.players);
    this.setState({
      isLobbyView: true,
    });
  }

  updateLobbyPlayers = () => {
    console.log("updateLobbyPlayers")
    const playersRef = database.ref(this.state.roomCode).child('players');
    playersRef.on('value', snapshot => {
      if (snapshot.exists()) {
        const playerList = [];
        snapshot.forEach(function(data) {
          playerList.push(data.val().name);
        });
        this.setState({
          players: playerList
        }, this.setLobbyView);
      }
    }, function(err) {
      alert(`players read failed: ${err.code}`)
    });
  }

  setCategoriesDatabase = () => {
    if (this.state.isHost) {
      console.log("[datbase] setting " + this.state.numCategories + " categories");
      let categories = this.state.categoriesList.map(category => category.name);
      database.ref(this.state.roomCode).child('categories').set(
        categories,
        (err) => {
          // Once we're here, the categories have been uploaded to the database
          // and we're ready to start the game
          this.startGame()
        });
    }
  }

  generateCategoryLetter = () => {
    var result           = '';
    var characters       = 'ABCDEFGHIJKLMNPRSTW';
    result = characters.charAt(Math.floor(Math.random() * characters.length));
    this.setState({
      categoryLetter: result,
    }, this.sendStartSignal);
  }

  tick = () => {
    var timeRemaining = this.state.timeRemaining
    if (timeRemaining === 0) {
      this.setState({
        timerShow: false,
        isGameView: false,
        isAwaitResultsView: false,
      })
      if (!this.state.isAnswerSubmitted) {
        this.onSubmitAnswers();
      }
      clearInterval(this.state.countdownHandler);
    }
    this.setState({
      timeRemaining: timeRemaining - 1
    })
  }
  sendStartSignal = () => {
    console.log('Category Letter = ' + this.state.categoryLetter);
    // Notify non-host players that the game is starting
    database.ref(this.state.roomCode).child('categoryLetter').set(this.state.categoryLetter);
    database.ref(this.state.roomCode).child('isGameStarted').set(true);
    database.ref(this.state.roomCode).child('players').off();
    database.ref(this.state.roomCode).child('timerValue').set(this.state.timeRemaining);
    database.ref(this.state.roomCode)
      .child("submittedCounter")
      .on('value', (snapshot) => {
        if (snapshot.val() === this.state.numPlayers) {
          console.log("All players have submitted their answers")
          this.getAnswersFromAllPlayers()
          database.ref(this.state.roomCode).child('isGameOver').set(true)
          clearInterval(this.state.countdownHandler)
          this.setState({
            isAwaitResultsView: false,
            timerShow: false,
          })
        }
      })
    var countdownHandler = setInterval(this.tick, 1000)
    this.setState({
      isGameView: true,
      isHostView: false,
      isJoinView: false,
      isLobbyView: false,
      timerShow: true,
      countdownHandler: countdownHandler,
    })
  }

  startGame = () => {
    console.log("Game START");
    this.generateCategoryLetter();
  }

  changeHandler = (event) => {
    let name = event.target.name;
    let val = event.target.value;
    if (name === "roomCode") {
      val = val.toUpperCase();
    }
    if (name === "timeRemaining") {
      val = parseInt(val, 10);
    }
    this.setState({
      [name]: val
    });
  }

  setValidRoom = (value) => {
    if (value === true) {
      this.setModalShow(false);
      if (this.state.isHost) {
        this.setState({
          isStartView: false,
          isLobbyView: true,
          isHostView: true,
        });
      } else {
        this.setState({
          isStartView: false,
          isLobbyView: true,
          isHostView: false,
        }, this.waitForGameStart);
      }
      this.updateLobbyPlayers();
    }
    this.setState({
      isValidRoom: value,
    })
  }

  submitHostFormHandler = (event) => {
    event.preventDefault();
    console.log("[local] setting " + this.state.numCategories + " categories");
    this.setState({
      categoriesList: GenerateRandomCategories(this.state.numCategories)
    },
      this.setCategoriesDatabase
    );
  }

  setModalShow = (value) => {
    this.setState({
      modalShow: value,
    });
  }

  showGameView = () => {
    database.ref(this.state.roomCode)
      .child('categoryLetter')
      .once('value').then((snapshot) => {
        if (snapshot.val() !== null) {
          this.setState({
            categoryLetter: snapshot.val()
          })
        }
      })
    database.ref(this.state.roomCode).child('categories')
      .on('value', snapshot => {
        if (snapshot.exists()) {
          let categories = []
          for (var i = 0; i < snapshot.val().length; i++) {
            categories.push({
              id: i,
              name: snapshot.val()[i],
              answer: ""
            })
          }
          this.setState({categoriesList: categories})
        }
      }, function(err) {
        alert(`isGameStart read failed: ${err.code}`)
      });
    this.setState({
      isGameView: true,
      isLobbyView: false,
    });
  }

  waitForGameStart = () => {
    console.log("Waiting for host to start the game");
    database.ref(this.state.roomCode).child('isGameStarted')
      .on('value', (snapshot) => {
        if (snapshot.val() === true) {
          database.ref(this.state.roomCode).child('players').off();
          this.showGameView();
        }
      });
    database.ref(this.state.roomCode).child('timerValue')
      .on('value', (snapshot) => {
        if (snapshot.val()) {
          console.log("timeRemaining: " + snapshot.val())

          var countdownHandler = setInterval(this.tick, 1000)

          this.setState({
            timeRemaining: snapshot.val(),
            timerShow: true,
            countdownHandler: countdownHandler
          })
        }
      })
    database.ref(this.state.roomCode).child('isGameOver')
      .on('value', (snapshot) => {
        if (snapshot.val() === true) {
          clearInterval(this.state.countdownHandler)
          this.setState({
            isAwaitResultsView: false,
            timerShow: false,
            isGameOver: snapshot.val(),
          })
        }
      })
  }

  incrementSubmittedCounter = () => {
    var submittedCounterRef = database.ref(this.state.roomCode+"/submittedCounter");
    submittedCounterRef.transaction(function(counter) {
      return counter + 1;
    });
  }

  incrementNumPlayersVoted = () => {
    var numPlayersVotedRef = database.ref(this.state.roomCode+"/numPlayersVoted");
    numPlayersVotedRef.transaction(function(counter) {
      return counter + 1;
    });
  }

  setAnswersDb = async () => {
    // Push the user-provided answers to the database
    let answers = []
    for (var i = 0; i < this.state.categoriesList.length; i++) {
      let answer = {
        value: this.state.categoriesList[i].answer,
        valid: false
      }
      if (answer.value.toUpperCase().startsWith(this.state.categoryLetter)) {
        answer.valid = true
      }
      answers.push(answer)
    }
    console.log('[database] setting answers ' + answers.map(ans => ans.value))
    let uid = auth.currentUser.uid;
    database.ref(this.state.roomCode)
      .child('players')
      .child(uid)
      .child('answers')
      .set(answers)
      .then(() => {return true});
  }

  setVotesDb = async () => {
    // Push the user-provided votes to the database
    const votes = this.state.voteResults
    console.log('[database] setting votes')
    console.log(votes)
    let uid = auth.currentUser.uid;
    database.ref(this.state.roomCode)
      .child('players')
      .child(uid)
      .child('votes')
      .set(votes)
      .then(() => {return true});
  }

  onSubmitAnswers = () => {
    console.log("onSubmitAnswers")
    this.setState({
      isAwaitResultsView: true,
      isGameView: false,
      isLobbyView: false,
      isAnswerSubmitted: true,
    });
    this.setAnswersDb().then(this.incrementSubmittedCounter())
    database.ref(this.state.roomCode)
      .child('submittedPlayers')
      .push(this.state.username)
    database.ref(this.state.roomCode)
      .child('submittedPlayers')
      .on('value', snapshot => {
          var submittedPlayers = []
          snapshot.forEach(function(data) {
            submittedPlayers.push(data.val());
          });

          this.setState({
            submittedPlayers: submittedPlayers
          })
      })

    database.ref(this.state.roomCode)
      .child('allAnswers')
      .on('value', snapshot => {
        if (snapshot.exists()) {
          this.setState({
            allAnswers: snapshot.val(),
            voteResults: this.getVoteResults(snapshot.val())
          }, () => {
            this.setState({
              isVotingView: true,
            })
          })

          database.ref(this.state.roomCode)
            .child('allAnswers')
            .off()
        }
      })
  }

  calculateScores = (allVotes) => {
    let are_scores_initialized = false
    let scores = {}

    for (var i = 0; i < allVotes.length; i++) {
      var question = allVotes[i]

      const uids = Reflect.ownKeys(question) // [ uid_0, uid_1, ..]

      if (!are_scores_initialized) {
        for (var k = 0; k < uids.length; k++){
          const uid = uids[k]
          scores[uid] = 0
        }

        are_scores_initialized = true
      }

      for (var j = 0; j < uids.length; j++) {
        const uid = uids[j]
        const votes = question[uid]

        var vote_count = 0

        for (var key in votes) {
          const vote = votes[key]

          if (vote === true) {
            vote_count = vote_count + 1
          } else if (vote === false) {
            vote_count = vote_count - 1
          } else {
            console.warn('Unexpected vote value. Must be true or false.')
          }
        }

        // If there are more YES vote than NO vote, add 1 point
        if (vote_count > 0) {
          scores[uid] = scores[uid] + 1
        }
      }
    }

    return scores
  }

  onSubmitVotes = () => {
    this.setState({
      isResultView: true,
      isVotingView: false
    })
    this.setVotesDb().then(this.incrementNumPlayersVoted())

    // The hosts calculates the scores and uploads them
    if (this.state.isHost) {
      var numPlayersVotedRef = database.ref(this.state.roomCode+"/numPlayersVoted");
      numPlayersVotedRef.on('value', (snapshot) => {

        if (snapshot.val() === this.state.numPlayers) {

          console.log("All players have submitted their votes")

          this.getVotesFromAllPlayers().then(() => {
            // FIXME allVotes is shaky for now, print it out!
            console.log(this.state.allVotes)
            const scores = this.calculateScores(this.state.allVotes)

            database.ref(this.state.roomCode)
              .child('players')
              .on('value', snapshot => {
                if (snapshot.exists()) {

                  // key: uid, value: name
                  var uidToName = {}

                  snapshot.forEach(childSnapshot => {
                    uidToName[childSnapshot.key] = childSnapshot.val().name
                  })
                }

                let newScores = {}
                const uids = Reflect.ownKeys(scores)
                for (let i = 0; i < uids.length; i++) {
                  let uid = uids[i]
                  newScores[uidToName[uid]] = scores[uid]
                }

                database.ref(this.state.roomCode)
                  .child('scores')
                  .set(newScores)
              })
         })
        }
      })
    }

    // Everyone listens for the scores from Firebase (incl. host)
    database.ref(this.state.roomCode)
      .child('scores')
      .on('value', snapshot => {
        if(snapshot.exists()) {
          const scores = snapshot.val()
          this.setState({ scores })

          // Don't need to listen for the scores from Firebase anymore
          // after after we get the first valid query
          database.ref(this.state.roomCode).child('score').off()
        }
      })
  }

  getVoteResults = (allAnswers) => {
    var voteResults = Array(allAnswers.length)
    for (var k = 0; k < allAnswers.length; k++) {
      voteResults[k] = {}
    }

    // Use any item in allAnswers array to retrive
    // all the user-ids. The index 0 here is arbitrary.
    var uids = []
    var item = allAnswers[0]
    var uid = null
    for (uid in item) {
      uids.push(uid)
    }

    for (var i = 0; i < voteResults.length; i++) {
      for (var j = 0; j < uids.length; j++) {
        uid = uids[j]
        if (allAnswers[i][uid].valid) {
          voteResults[i][uid] = true
        } else {
          voteResults[i][uid] = false
        }
      }
    }

    return voteResults
  }

  getAnswersFromAllPlayers = () => {
    database.ref(this.state.roomCode)
      .child('players')
      .on('value', snapshot => {
        let allAnswers = Array(this.state.numCategories)
        for (var j = 0; j < this.state.numCategories; j++) {
          allAnswers[j] = {}
        }

        if (snapshot.exists()) {
          snapshot.forEach(childSnapshot => {
            var answers = childSnapshot.val().answers

            for (var i = 0; i < answers.length; i++) {
              const answer = answers[i]
              allAnswers[i][childSnapshot.key] = answer
            }
          })
        }

        database.ref(this.state.roomCode)
          .child('allAnswers')
          .set(allAnswers)
      })
  }

  getVotesFromAllPlayers = async () => {
    // This function should only be called _after_ we are certain
    // all the votes have been submitted!
    database.ref(this.state.roomCode)
      .child('players')
      .once('value')
      .then(snapshot => {
        let allVotes = Array(this.state.numCategories)

        if (snapshot.exists()) {

          // Initialize allVotes properly!
          // allVotes = [
          //   {
          //     uid_0: { uid_0: t/f, uid_1: t/f, ...} ,
          //     uid_1: { uid_0: t/f, uid_1: t/f, ...} ,
          //     ...
          //   },
          //   ...
          // ]
          for (let j = 0; j < this.state.numCategories; j++) {
            allVotes[j] = {}

            snapshot.forEach(childSnapshot => {
              allVotes[j][childSnapshot.key] = {}
            })
          }

          snapshot.forEach(childSnapshot => {
            var votes = childSnapshot.val().votes

            for (let i = 0; i < votes.length; i++) {
              const answers = votes[i]
              const uids = Reflect.ownKeys(answers)

              for (let k = 0; k < uids.length; k++) {
                const uid = uids[k]
                allVotes[i][uid][childSnapshot.key] = answers[uid]
              }
            }
          })
        }

        this.setState({ allVotes })

        return true
      })
  }

  componentWillUnmount = () => {
    // TODO: put leaving logic here
    console.log("Component will unmount");
    auth.signOut();
    database.ref(this.state.roomCode+"/abandoned").set(true);
  }

  onClickAdminView = () => {
    console.log("Obliterating database")
    database.ref().set(null)
  }

  render() {
    return (
      <div className="App">
        {this.state.isStartView
          &&
          <StartView
            onCreate={this.createGame}
            onJoin={this.joinGame}
          />
        }
        <div className="body">
        {this.state.isHostView
          &&
          <HostView code={this.state.roomCode}
            onClick={this.startGame}
            changeHandler={this.changeHandler}
            submitHandler={this.submitHostFormHandler}
          />
        }
        {this.state.isLobbyView
          &&
          <LobbyView
            players={this.state.players}
            roomCode={this.state.roomCode}
          />
        }
        </div>
        <div className="Game-container">
        {this.state.timerShow
          &&
          <div className="Timer-container">
            <Timer timeRemaining={this.state.timeRemaining}/>
          </div>
        }
        {/* <AdminView onClick={this.onClickAdminView} /> */}
        {this.state.isGameView
          &&
          <GameView
            categories={this.state.categoriesList}
            categoryLetter={this.state.categoryLetter}
            onChange={this.onChangeAnswer}
            onSubmit={this.onSubmitAnswers}
            className="Game-view"
          />
        }
        </div>
        {this.state.isAwaitResultsView
          &&
          <AwaitResultsView players={this.state.submittedPlayers}/>
        }
        {this.state.isVotingView
          &&
          <VotingView
            categories={this.state.categoriesList}
            categoryLetter={this.state.categoryLetter}
            allAnswers={this.state.allAnswers}
            onChange={this.onChangeVoteCheckbox}
            voteResults={this.state.voteResults}
            onSubmitVotes={this.onSubmitVotes}
            numPlayers={this.state.numPlayers}
          />
        }
        {this.state.isResultView
          &&
          <ResultView
            scores={this.state.scores}
          />
        }
        <CreateForm
          show={this.state.modalShowCreateGame}
          onHide={() => this.setState({modalShowCreateGame: false})}
          onSubmit={this.submitCreateForm}
          onChange={this.changeHandler}
        />
        <JoinForm
          show={this.state.modalShowJoinGame}
          onHide={() => this.setState({modalShowJoinGame: false})}
          onSubmit={this.submitJoinForm}
          onChange={this.changeHandler}
        />
      </div>
    );
  }
}

function GenerateRandomCategories(size) {
    // Choose {size} categories from the following premade list
    const possible_categories = [
      "A boy’s name",
      "A river",
      "An animal",
      "Things that are cold",
      "Insects",
      "TV Shows",
      "Things that grow",
      "Fruits",
      "Things that are black",
      "School subjects",
      "Movie titles",
      "Musical Instruments",
    ]

    let chosen_categories = []
    for (var i = 0; i < size; i++) {
        // Choose a random category
        var random_index = Math.floor(Math.random() * possible_categories.length)
        chosen_categories.push({
            id: i,
            name: possible_categories[random_index],
            answer: ""
        })
        // Remove the chosen category from the list so we don't get duplicates
        possible_categories.splice(random_index, 1)
    }

    return chosen_categories;
}

export default App;
