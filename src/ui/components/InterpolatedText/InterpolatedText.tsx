import React from 'react';

import {Link} from '@gravity-ui/uikit';

import {Interpolate} from '../Interpolate/Interpolate';

type InterpolatedTextProps = {
    text: string;
    href?: string;
    br?: boolean;
    b?: boolean;
};

const InterpolatedTextComponent = ({text, href, br, b}: InterpolatedTextProps) => {
    const matches: Record<string, (match: string) => React.ReactNode> = {};

    if (href) {
        matches.link = (match) => {
            return (
                <Link href={href} target="_blank">
                    {match}
                </Link>
            );
        };
    }

    if (br) {
        matches.br = () => {
            return <br />;
        };
    }

    if (b) {
        matches.b = (match) => {
            return <b>{match}</b>;
        };
    }

    return <Interpolate text={text} matches={matches} />;
};

export const InterpolatedText = React.memo(InterpolatedTextComponent);
