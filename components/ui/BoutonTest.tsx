import React from 'react';

const BoutonTest: React.FC = () => {
  return (
    <button
      className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-lg shadow-md transition-colors duration-300
                 dark:bg-blue-700 dark:hover:bg-blue-800
                 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50
                 sm:py-3 sm:px-6 text-base sm:text-lg"
    >
      Bouton Test
    </button>
  );
};

export default BoutonTest;