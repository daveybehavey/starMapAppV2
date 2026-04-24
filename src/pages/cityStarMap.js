import React from 'react';
import { Link } from 'react-router-dom';
import './CityStarMap.css';

const CityStarMap = () => {
  return (
    <div className="city-star-map-container">
      <h1 className="headline">Explore the Stars in Your City</h1>
      <p className="subheadline">
        Discover the most breathtaking views of the night sky right from your neighborhood.
      </p>
      <button className="cta-button">
        <Link to="/explore">Start Your Journey</Link>
      </button>
      <section className="features">
        <h2 className="features-title">Why Choose Our City Star Map?</h2>
        <ul className="features-list">
          <li>✨ Comprehensive coverage of city skies</li>
          <li>🔭 Interactive features for detailed exploration</li>
          <li>📅 Events and updates on local stargazing opportunities</li>
        </ul>
      </section>
      <footer className="footer">
        <p>Join our community of stargazers!</p>
        <button className="cta-button">
          <Link to="/signup">Sign Up Now</Link>
        </button>
      </footer>
    </div>
  );
};

export default CityStarMap;

// CityStarMap.css
.city-star-map-container {
  padding: 20px;
  text-align: center;
}
.headline {
  font-size: 2.5em;
  margin-bottom: 20px;
}
.subheadline {
  font-size: 1.2em;
  margin-bottom: 30px;
}
.cta-button {
  background-color: #4caf50;
  color: white;
