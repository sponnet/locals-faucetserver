// Import React and Component
    import React, { Component } from 'react';
    // Import CSS from App.css
    import './App.css';
    // Import the Today component to be used below
    import FaucetInfo from './FaucetInfo/FaucetInfo';
    import FaucetRequest from './FaucetRequest/FaucetRequest';
   

    class App extends Component {
      render() {
        return (
          <div className="">
              <div className="topheader">
                  <header className="container">
                      <nav className="navbar">
                          <div className="navbar-brand">
                              <span className="navbar-item">Ethereum Faucet</span>
                          </div>
                      </nav>
                  </header>
              </div>
              <section className="results--section">
                  <div className="results--section__inner">
                     <FaucetInfo />
                  </div>
                  <div className="results--section__inner">
                     <FaucetRequest />
                  </div>
              </section>
          </div>
        );
      }
    }

    export default App;
