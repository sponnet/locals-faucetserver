import React, {
	Component
} from 'react';
import './FaucetRequest.css';

class FaucetRequest extends Component {
 constructor(props) {
    super(props);
    this.state = {value: ''};

    this.handleChange = this.handleChange.bind(this);
    this.handleSubmit = this.handleSubmit.bind(this);
  }

  handleChange(event) {
    this.setState({value: event.target.value});
  }

  handleSubmit(event) {
    alert('A name was submitted: ' + this.state.value);
    event.preventDefault();
  }


        render() {
            return (
                <div className="today--section container">
                    <h2>Your ETH address</h2>
                    <form>
                    <div className="field">
                      <div className="control">
                        <input className="input is-primary" type="text" placeholder="your ETH address" value={this.state.value} onChange={this.handleChange} />
                      </div>
                    </div>
                    <input type="submit" value="Submit" />
                    </form>
                </div>
            )
        }
}

export default FaucetRequest;
