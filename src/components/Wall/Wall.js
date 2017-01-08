import styles from './wall.css';

import React from 'react';
import Plain from '../plain/plain';
import { getTransformRule } from '../../lib/utils';

// no support for rotated walls for now
class Wall extends React.Component {
    constructor(props) {
        super(props);

        this.posWithInvertedY = [props.pos[0], -props.pos[1], props.pos[2]];
        this.styleRules = getTransformRule({ pos: this.posWithInvertedY });
        this.className = [
            'obj',
            styles.root,
            styles['mode-' + props.mode]
        ].join(' ');
    }

    shouldComponentUpdate(nextProps) {
        return nextProps.playerPos !== this.props.playerPos;
    }

    render() {
        const { size, playerPos } = this.props;

        // Front-Back-Left-Right
        return <div className={this.className} style={this.styleRules}>
            <Plain
                pos={[0, 0, size[2] / 2]}
                parentPos={[this.posWithInvertedY]}
                playerPos={playerPos}
                size={size}
                angle={[0, 0, 0]}
            />
            <Plain
                pos={[0, 0, -size[2] / 2]}
                parentPos={[this.posWithInvertedY]}
                playerPos={playerPos}
                size={size}
                angle={[0, 180, 0]}
            />
            <Plain
                pos={[-size[0] / 2, 0, 0]}
                parentPos={[this.posWithInvertedY]}
                playerPos={playerPos}
                size={[size[2], size[1]]}
                angle={[0, -90, 0]}
            />
            <Plain
                pos={[size[0] / 2, 0, 0]}
                parentPos={[this.posWithInvertedY]}
                playerPos={playerPos}
                size={[size[2], size[1]]}
                angle={[0, 90, 0]}
            />
        </div>;
    }
}

export default Wall;
