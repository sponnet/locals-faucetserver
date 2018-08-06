import React, {
	Component
} from 'react';
import './FaucetInfo.css';
import axios from 'axios';

class FaucetInfo extends Component {
	// Adds a class constructor that assigns the initial state values:
	constructor() {
		super();
		this.state = {
			faucetinfo: {},
		};
	}
	 // This is called when an instance of a component is being created and inserted into the DOM.
        componentWillMount () {
            axios.get('https://faucet.ropsten.be/faucetinfo')
                .then(response => {
                    this.setState({ faucetinfo: response.data });
                    localStorage.setItem('faucetinfo', response.data);
                })
                // Catch any error here
                .catch(error => {
                    console.log(error)
                })
        }

        componentDidMount () {
            if (!navigator.onLine) {
                try{
                let f = JSON.parse(localStorage.getItem('faucetinfo'));
                this.setState({ faucetinfo: f });
            }catch(e){
                //
            }
            }
        }

 // The render method contains the JSX code which will be compiled to HTML.
        render() {
            return (
                <div className="today--section container">
                    <h2>Serving from account</h2>
                    <div className="columns today--section__box">
                        <div className="column btc--section">
                            <h5>{this.state.faucetinfo.account}</h5>
                        </div>
                        <div className="column eth--section">
                            <h5>Faucet balance</h5>
                            <p>{this.state.faucetinfo.balance} ETH</p>
                        </div>
                    </div>
                </div>
            )
        }

}

export default FaucetInfo;
