import React, { Component } from "react";
import "./FaucetInfo.css";
import axios from "axios";
import NumberFormat from "react-number-format";
import config from "react-global-configuration";

class FaucetInfo extends Component {
  // Adds a class constructor that assigns the initial state values:
  constructor() {
    super();
    this.state = {
      faucetinfo: null
    };
  }
  // This is called when an instance of a component is being created and inserted into the DOM.
  componentWillMount() {
    axios
      .get(config.get("apiurl") + "/faucetinfo")
      .then(response => {
        response.data.etherscanlink =
          response.data.etherscanroot + "/address/" + response.data.account;
        this.setState({ faucetinfo: response.data });
        localStorage.setItem("faucetinfo", response.data);
      })
      // Catch any error here
      .catch(error => {
        console.log(error);
      });
  }

  componentDidMount() {
    if (!navigator.onLine) {
      try {
        let f = JSON.parse(localStorage.getItem("faucetinfo"));
        this.setState({ faucetinfo: f });
      } catch (e) {
        //
      }
    }
  }

  // The render method contains the JSX code which will be compiled to HTML.
  render() {
    if (!this.state.faucetinfo) return null;
    return (
      <section className="section">
        <div className="content has-text-centered has-text-weight-light">
          <p>
            This faucet drips {this.state.faucetinfo.payoutamountinether} Ether
            every {this.state.faucetinfo.payoutfrequencyinsec} seconds. You can
            register your account in our queue. Max queue size is currently{" "}
            {this.state.faucetinfo.queuesize}. Serving from account{" "}
            <a target="_new" href={this.state.faucetinfo.etherscanlink}>
              {this.state.faucetinfo.account}
            </a>
            ( balance{" "}
            <NumberFormat
              value={Math.floor(this.state.faucetinfo.balance)}
              displayType={"text"}
              thousandSeparator={true}
              suffix={" ETH"}
            />
            ).
          </p>
          <p>
            Example command line: wget {config.get("apiurl")}
            /donate/&lt;your ethereum address&gt; <br />
            <a
              target="_new"
              href="https://github.com/sponnet/locals-faucetserver#api"
            >
              API docs
            </a>
          </p>
        </div>
      </section>
    );
  }
}

export default FaucetInfo;
