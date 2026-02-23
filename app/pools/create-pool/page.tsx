import React from 'react'

import { PoolCreateComponent } from './_components/PoolCreateComponent';


export const metadata /* Metadata */ = {
    title: 'Prism DEX - Create new Pool',
    //description: 'Welcome to Prism DEX',
}

const PoolCreatePage: React.FC = async () => {

    return (
        <>
            <PoolCreateComponent />
        </>
    );
}

export default PoolCreatePage
