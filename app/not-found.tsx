
import React from 'react'


const NotFound: React.FC = () => {
    return (
        <div className="text-center py-12">
            <h2 className="text-4xl font-bold text-gray-800 mb-4">404 - Page Not Found</h2>
            <p className="text-lg text-gray-600 mb-8">
                The page you are looking for doesn't exist.
            </p>
            <a
                href="/"
                className="inline-block bg-background-btn text-foreground-btn px-6 py-3 rounded-md transition-colors"
            >
                Back to Home
            </a>
        </div>
    )
}


export default NotFound
