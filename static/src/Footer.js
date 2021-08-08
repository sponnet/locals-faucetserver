import React, { Component } from "react";

class Comp extends Component {
  // Adds a class constructor that assigns the initial state values:
  constructor() {
    super();
    this.state = {
      faucetinfo: null
    };
  }
  // The render method contains the JSX code which will be compiled to HTML.
  render() {
    return (
      <section className="section">
        <div className="content has-text-centered has-text-weight-light">
          <p>
		For inquiries, support or just to say thanks please reach out to us on Twitter 
</p>
<div className="level">
<div className="level-item">



<div class="media">
      <div class="media-left">
        <figure class="image is-64x64">
          <img src="https://pbs.twimg.com/profile_images/1346114756353159175/MVVuuEHu_400x400.jpg" alt="DeFi Karen"/>
        </figure>
      </div>
      <div class="media-content">
        <p class="title is-4">DeFi Karen</p>
        <p class="subtitle is-6"><a href="https://twitter.com/defikaren" target="_blank">@defikaren</a></p>
      </div>
    </div>



</div>
</div>
        </div>
      </section>
    );
  }
}

export default Comp;
