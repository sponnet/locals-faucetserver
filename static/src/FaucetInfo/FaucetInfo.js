import React, { Component } from "react";
import "./FaucetInfo.css";
import axios from "axios";
import NumberFormat from "react-number-format";
import config from "react-global-configuration";



const FaucetInfo = () => {

  const [faucetinfo, setFaucetinfo] = React.useState();

  React.useEffect(() => {
    axios
      .get(config.get("apiurl") + "/faucetinfo")
      .then(response => {
        response.data.etherscanlink =
          response.data.etherscanroot + "/address/" + response.data.account;
          setFaucetinfo(response.data);
        // this.setState({ faucetinfo: response.data });
        // localStorage.setItem("faucetinfo", response.data);
      })
      // Catch any error here
      .catch(error => {
        console.log(error);
      });
}, []);


    if (!faucetinfo) return null;
    return (
      <section className="section">
        <div className="content has-text-centered has-text-weight-light">
          <p>
            This faucet drips {faucetinfo.payoutamountinether} Ether
            every {faucetinfo.payoutfrequencyinsec} seconds. You can
            register your account in our queue. Max queue size is currently{" "}
            {faucetinfo.queuesize}. Serving from account{" "}
            <a target="_new" href={faucetinfo.etherscanlink}>
              {faucetinfo.account}
            </a>
            {"  "}(balance{" "}
            <NumberFormat
              value={Math.floor(faucetinfo.balance)}
              displayType={"text"}
              thousandSeparator={true}
              suffix={" ETH"}
            />
            ).
          </p>
        </div>
      </section>
    );
  
}

export default FaucetInfo;
