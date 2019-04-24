#
# ~/.bashrc
#

# If not running interactively, don't do anything
[[ $- != *i* ]] && return

alias ls='ls --color=auto'
PS1='[\u@\h \W]\$ '

# Start xinit (i3 start is in .xinitrc) 
if [[ "$(tty)" = "/dev/tty1" ]]; then
	startx
fi 

# Powerline enable 
powerline-daemon -q
POWERLINE_BASH_CONTINUATION=1
POWERLINE_BASH_SELECT=1
. /usr/share/powerline/bindings/bash/powerline.sh 

# Command for pipes.sh
alias pipes='~/.local/bin/pipes.sh'

# OpenFOAM Install
#export FOAM_INST_DIR='$HOME/.OpenFOAM'
#alias of20x='source $FOAM_INST_DIR/OpenFOAM-2.0.x/etc/bashrc'
alias ofoam='source /opt/OpenFOAM/OpenFOAM-6/etc/bashrc'
alias paraFoam='paraFoam -builtin'

# MATLAB alias (nojvm disables java features, vastly increases speed)
alias mat='matlab -nosplash -nodesktop'

# Betterlockscreen alias
alias lock='betterlockscreen -l'

# TeX cleaner command
alias texclean='rm *.aux *.log *.out'

# Grow bonsai trees
alias bonsai='~/github/external/bonsai.sh/bonsai.sh'

# Jupyter lab install directory
export JUPYTERLAB_DIR=$HOME/.local/share/jupyter/lab
alias jn='jupyter notebook --ip=0.0.0.0 --port=8080'
alias jl='jupyter lab --ip=0.0.0.0 --port=8080'

# Alias the moving back of directories
alias ...='../..'
alias ....='../../../'

# Alias for starting ranger in Sync
alias sranger='cd ~/sync && ranger'

# Get me some 256s colors
export TERM=rxvt-256color

