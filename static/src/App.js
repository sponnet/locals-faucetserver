// Import React and Component
import React, { Component } from "react";
import "bulma/css/bulma.css";
import "./App.css";
import FaucetInfo from "./FaucetInfo/FaucetInfo";
import FaucetQueue from "./FaucetInfo/FaucetQueue";
import FaucetRequest from "./FaucetRequest/FaucetRequest";
import Footer from "./Footer";
import config from "react-global-configuration";
import configuration from "./config";

config.set(configuration);


const App = () => {


  const [lastDonation, setLastDonation] = React.useState();

  const onQueued = () => {
    setLastDonation(Date.now())
  }

  return (
    <div>
      <section className="hero is-primary">
        <div className="hero-body">
          <div className="container">
            <h1 className="title">Ropsten Ethereum Faucet</h1>
          </div>
        </div>
      </section>

      <div className="container">
        <FaucetRequest onQueued={onQueued} />
        <FaucetQueue lastDonation={lastDonation} />
        <FaucetInfo />
      </div>

      <Footer />

    </div>
  );

}

export default App;
